import { useState, useRef, useCallback, useEffect } from "react";
import { useWorkflowStore } from "../store/workflowStore";
import { getAIContext } from "../nodes/registry";
import { getApiKey } from "./SettingsModal";

interface Message {
  role: "user" | "assistant";
  content: string;
}

type AiProvider = "gemini" | "openai" | "claude";

const PROVIDER_LABELS: Record<AiProvider, string> = {
  gemini: "Gemini",
  openai: "ChatGPT",
  claude: "Claude",
};

const PROVIDER_MODELS: Record<AiProvider, string> = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o",
  claude: "claude-sonnet-4-20250514",
};

function buildSystemPrompt(): string {
  const nodeContext = getAIContext();
  return `You are FlowStudio AI assistant. You help users create and manage visual node-based workflows for image/video/audio generation.

You can:
1. Explain what nodes do and how to connect them
2. Suggest workflows for user's goals
3. Create nodes by responding with JSON commands

Available native nodes:
${nodeContext}

When the user asks to create a workflow, respond with explanation AND a JSON block:
\`\`\`workflow
{
  "nodes": [
    { "type": "fs:prompt", "values": { "text": "a cat in space" } },
    { "type": "fs:localGenerate", "values": { "model": "flux-2-klein-4b.safetensors" } }
  ],
  "edges": [
    { "from": 0, "fromHandle": "output_0", "to": 1, "toHandle": "prompt" }
  ]
}
\`\`\`

The user speaks Russian primarily. Respond in the same language as the user.
Be concise and helpful. Focus on practical solutions.`;
}

async function callGemini(messages: Message[], systemPrompt: string): Promise<string> {
  const apiKey = getApiKey("google");
  if (!apiKey) return "Google API key not set. Go to Settings (⚙).";

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${PROVIDER_MODELS.gemini}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return `Error: ${err.error?.message || res.statusText}`;
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
}

async function callOpenAI(messages: Message[], systemPrompt: string): Promise<string> {
  const apiKey = getApiKey("openai");
  if (!apiKey) return "OpenAI API key not set. Go to Settings (⚙).";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: PROVIDER_MODELS.openai,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return `Error: ${err.error?.message || res.statusText}`;
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "No response";
}

async function callClaude(messages: Message[], systemPrompt: string): Promise<string> {
  const apiKey = getApiKey("claude");
  if (!apiKey) return "Claude API key not set. Add 'claude' key in Settings (⚙).";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: PROVIDER_MODELS.claude,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return `Error: ${err.error?.message || res.statusText}`;
  }

  const data = await res.json();
  return data.content?.[0]?.text || "No response";
}

export default function AiChat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<AiProvider>("gemini");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const addNode = useWorkflowStore((s) => s.addNode);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Parse and execute workflow commands from AI response
  const executeWorkflow = useCallback((text: string) => {
    const match = text.match(/```workflow\s*([\s\S]*?)```/);
    if (!match) return;

    try {
      const wf = JSON.parse(match[1]);
      if (!wf.nodes) return;

      const idMap = new Map<number, string>();

      // Create nodes
      wf.nodes.forEach((n: any, i: number) => {
        addNode(n.type, { x: 200 + i * 350, y: 200 });
        const state = useWorkflowStore.getState();
        const newNode = state.nodes[state.nodes.length - 1];
        if (newNode) {
          idMap.set(i, newNode.id);
          // Apply values
          if (n.values) {
            for (const [k, v] of Object.entries(n.values)) {
              useWorkflowStore.getState();
              useWorkflowStore.setState({
                nodes: useWorkflowStore.getState().nodes.map((node) =>
                  node.id === newNode.id
                    ? { ...node, data: { ...node.data, widgetValues: { ...node.data.widgetValues, [k]: v } } }
                    : node
                ),
              });
            }
          }
        }
      });

      // Create edges
      if (wf.edges) {
        const state = useWorkflowStore.getState();
        const newEdges = wf.edges
          .filter((e: any) => idMap.has(e.from) && idMap.has(e.to))
          .map((e: any) => ({
            id: `e_ai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            source: idMap.get(e.from)!,
            sourceHandle: e.fromHandle,
            target: idMap.get(e.to)!,
            targetHandle: e.toHandle,
            style: { stroke: "#5b9bd5", strokeWidth: 1 },
          }));

        useWorkflowStore.setState({
          edges: [...state.edges, ...newEdges],
        });
      }
    } catch (err) {
      console.error("[AiChat] Failed to parse workflow:", err);
    }
  }, [addNode]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const systemPrompt = buildSystemPrompt();
    let response: string;

    try {
      switch (provider) {
        case "gemini":
          response = await callGemini(newMessages, systemPrompt);
          break;
        case "openai":
          response = await callOpenAI(newMessages, systemPrompt);
          break;
        case "claude":
          response = await callClaude(newMessages, systemPrompt);
          break;
      }
    } catch (err: any) {
      response = `Error: ${err.message}`;
    }

    const assistantMsg: Message = { role: "assistant", content: response };
    setMessages([...newMessages, assistantMsg]);
    setLoading(false);

    // Try to execute workflow commands
    executeWorkflow(response);
  }, [input, messages, loading, provider, executeWorkflow]);

  if (!open) return null;

  return (
    <div className="ai-chat">
      <div className="ai-chat-header">
        <span className="ai-chat-title">AI Assistant</span>
        <div className="ai-chat-controls">
          <select
            className="ai-provider-select"
            value={provider}
            onChange={(e) => setProvider(e.target.value as AiProvider)}
          >
            {Object.entries(PROVIDER_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button className="ai-chat-close" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className="ai-chat-messages">
        {messages.length === 0 && (
          <div className="ai-chat-welcome">
            <p>Hi! I can help you build workflows.</p>
            <p className="ai-chat-hint">Try: "Create a text-to-image workflow"</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`ai-msg ai-msg-${msg.role}`}>
            <div className="ai-msg-content">{msg.content}</div>
          </div>
        ))}
        {loading && (
          <div className="ai-msg ai-msg-assistant">
            <div className="ai-msg-content ai-typing">Thinking...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="ai-chat-input">
        <textarea
          className="ai-input-field nodrag nowheel"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Describe what you need..."
          rows={2}
        />
        <button
          className="ai-send-btn"
          onClick={handleSend}
          disabled={loading || !input.trim()}
        >
          ▶
        </button>
      </div>
    </div>
  );
}
