import { memo, useCallback, useState, useEffect, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { generateText } from "../api/geminiApi";
import { log } from "../store/logStore";
import { getConnectedImageUrl, getConnectedPrompt } from "../hooks/useNodeHelpers";
import { CRITIQUE_SYSTEM, urlToBase64 } from "../utils/llmCallbacks";
import { useAutoGrowTextarea } from "../utils/useAutoGrow";

function CritiqueNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storedText: string = nodeData.widgetValues?.text ?? "";
  const [localText, setLocalText] = useState(storedText);
  const lastWriteRef = useRef(storedText);
  useEffect(() => {
    if (storedText !== lastWriteRef.current) {
      setLocalText(storedText);
      lastWriteRef.current = storedText;
    }
  }, [storedText]);
  const result = localText;
  const model: string = nodeData.widgetValues?.model || "gemini-2.5-flash";

  const handleRun = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    setError(null);
    const startTime = Date.now();

    const wv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const userPrompt = getConnectedPrompt(id, nodesAll as any[], edgesAll as any[]);
    const srcUrl = getConnectedImageUrl(id, "input", nodesAll as any[], edgesAll as any[]);

    // Diagnose: if the user wired an image source but we can't fetch a preview,
    // surface a clear message instead of silently falling back to prompt-only.
    const imgEdge = edgesAll.find((e: any) => e.target === id && e.targetHandle === "input");
    if (imgEdge && !srcUrl) {
      setError("Connected image source has no preview yet. Run that node first.");
      setProcessing(false);
      return;
    }
    if (!srcUrl && !userPrompt) {
      setError("Connect an image or a prompt");
      setProcessing(false);
      return;
    }

    log(`Critique started (${srcUrl ? "image" : "prompt-only"})`, { nodeId: id, nodeType: "fs:critique", nodeLabel: "Critique" });

    try {
      const image = srcUrl ? await urlToBase64(srcUrl) : undefined;
      const userText = image
        ? (userPrompt
            ? `The image was meant to match this goal: "${userPrompt}". Review the image visually and list concrete problems you see.`
            : `Review this image visually. List concrete problems: composition, anatomy, lighting, textures, colour, artefacts.`)
        : `Critique this prompt for a diffusion model:\n"${userPrompt}"`;
      const r = await generateText({
        model: wv.model || "gemini-2.5-flash",
        systemPrompt: CRITIQUE_SYSTEM,
        userText,
        image,
        temperature: wv.temperature ?? 0.4,
        maxOutputTokens: wv.maxOutputTokens ?? 4096,
      });
      if (r.error) {
        setError(r.error);
        log("Critique failed", { nodeId: id, nodeType: "fs:critique", status: "error", details: r.error });
        setProcessing(false);
        return;
      }
      lastWriteRef.current = r.text;
      setLocalText(r.text);
      updateWidgetValue(id, "text", r.text);
      updateWidgetValue(id, "_genTime", Date.now() - startTime);
      log("Critique complete", { nodeId: id, nodeType: "fs:critique", status: "success", details: r.text.slice(0, 80) });
    } catch (err: any) {
      setError(err.message);
    }
    setProcessing(false);
  }, [id, edgesAll, nodesAll, updateWidgetValue]);

  const imgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const promptHL = connectingDir === "source" && (connectingType === "TEXT" || connectingType === "*") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "TEXT" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(imgHL || promptHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  return (
    <div
      className={`describe-node nanob-node ${selected ? "selected" : ""} ${dimClass}`}
      style={{
        width: 420,
        borderColor: selected ? "#ef5350" : undefined,
        boxShadow: selected ? "0 0 0 1px #ef5350, 0 0 20px rgba(239,83,80,0.35), 0 8px 24px rgba(0,0,0,0.4)" : undefined,
      }}
      onClick={() => setSelectedNode(id)}
    >
      <div className="nanob-node-inner">
        <div className="nanob-accent" style={{ background: "#ef5350" }} />
        <div className="nanob-header">
          <span className="nanob-icon" style={{ background: "rgba(239,83,80,0.15)" }}>🧐</span>
          <div className="nanob-header-text">
            <span className="nanob-title">Critique</span>
            <span className="nanob-status" style={{ color: "#ef5350" }}>
              {processing ? "ANALYZING..." : model}
            </span>
          </div>
        </div>
      </div>

      <div className="nanob-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="input" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Image</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="prompt" className={`slot-handle ${promptHL}`} style={{ color: "#f0c040" }} />
          <TypeBadge color="#f0c040">TXT</TypeBadge>
          <span className="nanob-input-label">Goal / prompt</span>
        </div>
      </div>

      <textarea
        ref={useAutoGrowTextarea(result)}
        className="describe-result nodrag nowheel"
        value={result}
        placeholder="Connect image or prompt, then click Critique"
        spellCheck={false}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          setLocalText(e.target.value);
          lastWriteRef.current = e.target.value;
          updateWidgetValue(id, "text", e.target.value);
        }}
        style={{
          display: "block", width: "calc(100% - 24px)", boxSizing: "border-box",
          margin: "8px 12px", padding: "10px 12px",
          minHeight: 150, maxHeight: 600, resize: "vertical", overflowY: "auto",
          background: "rgba(239,83,80,0.06)", border: "1px solid rgba(239,83,80,0.22)",
          borderRadius: 6, fontSize: 12, lineHeight: 1.5, color: "#cfcfe8",
          whiteSpace: "pre-wrap", fontFamily: "inherit", outline: "none",
        }}
      />

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button
          className={`nanob-generate-btn ${processing ? "generating" : ""}data-fs-run-id={id} `}
          style={{ background: processing ? "#7a2a26" : "#ef5350", color: "#fff" }}
          onClick={handleRun}
          disabled={processing}
        >
          {processing ? "Analyzing..." : "🧐 Critique"}
        </button>
        {result && !processing && (
          <button
            className="nanob-dice-btn"
            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(result); }}
            title="Copy text"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
        )}
      </div>

      <div className="nanob-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <TypeBadge color="#f0c040">TXT</TypeBadge>
          <span className="nanob-output-label">Text</span>
          <Handle type="source" position={Position.Right} id="output_0" className={`slot-handle ${outputHL}`} style={{ color: "#f0c040" }} />
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="type-badge" style={{ color, borderColor: color + "66", backgroundColor: color + "12" }}>{children}</span>;
}

function OptBadge() {
  return (
    <span style={{
      fontSize: 9, padding: "1px 5px", borderRadius: 3,
      color: "#888", border: "1px solid #444",
      marginLeft: "auto", letterSpacing: 0.4,
    }}>OPT</span>
  );
}

export default memo(CritiqueNode);
