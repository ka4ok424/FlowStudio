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

  // Get current canvas state for AI context
  const state = useWorkflowStore.getState();
  const existingNodes = state.nodes.map((n: any) => ({
    id: n.id,
    type: n.data?.type,
    label: n.data?.label,
    x: Math.round(n.position.x),
    y: Math.round(n.position.y),
    width: n.measured?.width || 320,
    height: n.measured?.height || 300,
  }));
  const canvasInfo = existingNodes.length > 0
    ? `\n\nCurrent canvas (${existingNodes.length} nodes):\n${JSON.stringify(existingNodes, null, 1)}`
    : "\n\nCanvas is empty.";

  return `You are FlowStudio AI assistant. You help users create and manage visual node-based workflows for image/video/audio generation.

You can:
1. Explain what nodes do and how to connect them
2. Suggest workflows for user's goals
3. Create nodes with precise positioning (x, y coordinates)
4. Move existing nodes to rearrange the canvas

Available native nodes:
${nodeContext}
${canvasInfo}

CREATING NODES — use x,y to position them. Avoid overlapping existing nodes.
Space nodes ~400px apart horizontally, ~350px vertically. Layout left-to-right:
\`\`\`workflow
{
  "nodes": [
    { "type": "fs:prompt", "x": 100, "y": 200, "values": { "text": "a cat in space" } },
    { "type": "fs:localGenerate", "x": 500, "y": 200, "values": {} }
  ],
  "edges": [
    { "from": 0, "fromHandle": "output_0", "to": 1, "toHandle": "prompt" }
  ]
}
\`\`\`

MOVING EXISTING NODES — use node IDs from canvas state:
\`\`\`workflow
{
  "moveNodes": [
    { "id": "node_5", "x": 800, "y": 300 },
    { "id": "node_3", "x": 100, "y": 100 }
  ]
}
\`\`\`

GROUPS — visual containers to organize nodes:
\`\`\`workflow
{
  "nodes": [
    { "type": "fs:group", "x": 50, "y": 50, "values": { "title": "Scene 1: Forest", "color": "green", "width": 1200, "height": 500 } },
    { "type": "fs:comment", "x": 70, "y": 560, "values": { "text": "Characters for scene 1", "color": "yellow" } },
    { "type": "fs:prompt", "x": 100, "y": 130, "values": { "text": "..." } }
  ]
}
\`\`\`
Place nodes INSIDE the group area (between group x,y and x+width, y+height).
Group colors: red, blue, green, purple, orange, cyan.
Comment colors: yellow, blue, green, red, purple.

You can combine all commands: create nodes, move existing ones, create groups/comments.

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
  const messages = useWorkflowStore((s) => s.chatMessages) as Message[];
  const addChatMessage = useWorkflowStore((s) => s.addChatMessage);
  const clearChat = useWorkflowStore((s) => s.clearChat);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<AiProvider>("gemini");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const addNode = useWorkflowStore((s) => s.addNode);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Find a free position that doesn't overlap with existing nodes
  const findFreePosition = useCallback((preferX: number, preferY: number, nodeWidth = 350, nodeHeight = 400): { x: number; y: number } => {
    const existing = useWorkflowStore.getState().nodes;
    const isOverlapping = (x: number, y: number) => {
      return existing.some((n) => {
        const nx = n.position.x;
        const ny = n.position.y;
        const nw = (n.measured?.width || 320);
        const nh = (n.measured?.height || 300);
        return x < nx + nw + 30 && x + nodeWidth + 30 > nx && y < ny + nh + 30 && y + nodeHeight + 30 > ny;
      });
    };

    // Try preferred position first
    if (!isOverlapping(preferX, preferY)) return { x: preferX, y: preferY };

    // Spiral search for free spot
    for (let radius = 1; radius < 20; radius++) {
      for (let angle = 0; angle < 8; angle++) {
        const dx = Math.cos(angle * Math.PI / 4) * radius * 400;
        const dy = Math.sin(angle * Math.PI / 4) * radius * 400;
        const testX = preferX + dx;
        const testY = preferY + dy;
        if (!isOverlapping(testX, testY)) return { x: testX, y: testY };
      }
    }
    return { x: preferX + 500, y: preferY }; // fallback
  }, []);

  // Parse and execute workflow commands from AI response
  const executeWorkflow = useCallback((text: string) => {
    const match = text.match(/```workflow\s*([\s\S]*?)```/);
    if (!match) return;

    try {
      const wf = JSON.parse(match[1]);

      // Handle moveNode commands
      if (wf.moveNodes && Array.isArray(wf.moveNodes)) {
        for (const mv of wf.moveNodes) {
          if (mv.id && typeof mv.x === "number" && typeof mv.y === "number") {
            useWorkflowStore.setState({
              nodes: useWorkflowStore.getState().nodes.map((n) =>
                n.id === mv.id ? { ...n, position: { x: mv.x, y: mv.y } } : n
              ),
            });
          }
        }
      }

      if (!wf.nodes) return;

      const idMap = new Map<number, string>();

      // Create nodes with position support
      wf.nodes.forEach((n: any, i: number) => {
        // Use specified x,y or auto-layout
        const preferX = typeof n.x === "number" ? n.x : 200 + i * 400;
        const preferY = typeof n.y === "number" ? n.y : 200;
        const pos = typeof n.x === "number" && typeof n.y === "number"
          ? { x: n.x, y: n.y }  // exact position from AI
          : findFreePosition(preferX, preferY); // auto-find free spot

        addNode(n.type, pos);
        const state = useWorkflowStore.getState();
        const newNode = state.nodes[state.nodes.length - 1];
        if (newNode) {
          idMap.set(i, newNode.id);

          // Set group size if specified
          if (n.type === "fs:group" && n.values) {
            const w = n.values.width || 800;
            const h = n.values.height || 400;
            useWorkflowStore.setState({
              nodes: useWorkflowStore.getState().nodes.map((node) =>
                node.id === newNode.id
                  ? { ...node, style: { ...node.style, width: w, height: h } }
                  : node
              ),
            });
          }

          // Apply values
          if (n.values) {
            for (const [k, v] of Object.entries(n.values)) {
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
  }, [addNode, findFreePosition]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    addChatMessage(userMsg);
    const newMessages = [...messages, userMsg];
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
    addChatMessage(assistantMsg);
    setLoading(false);

    // Try to execute workflow commands
    executeWorkflow(response);
  }, [input, messages, loading, provider, addChatMessage, executeWorkflow]);

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
          <button className="ai-chat-close" onClick={clearChat} title="Clear chat">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          </button>
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
