import { memo, useCallback, useState, useEffect, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt, getComfyUrl } from "../api/comfyApi";
import { log } from "../store/logStore";
import { uploadSourceImage, getConnectedImageUrl } from "../hooks/useNodeHelpers";
import { buildDescribeWorkflow, JOY_EXTRAS_KEYS, type DescribeModel } from "../workflows/describe";
import { useAutoGrowTextarea } from "../utils/useAutoGrow";

async function pollForText(promptId: string, interval = 1500, maxAttempts = 300): Promise<string | { error: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, interval));
    try {
      const res = await fetch(`${getComfyUrl()}/api/history/${promptId}`);
      if (!res.ok) continue;
      const hist = await res.json();
      const run = hist[promptId];
      if (!run) continue;
      const outs = run.outputs || {};
      for (const nid of Object.keys(outs)) {
        const t = outs[nid]?.text;
        if (Array.isArray(t) && t.length > 0 && typeof t[0] === "string") {
          return t.join("\n").trim();
        }
        const s = outs[nid]?.string;
        if (Array.isArray(s) && s.length > 0 && typeof s[0] === "string") {
          return s.join("\n").trim();
        }
      }
      const st = run.status;
      if (st?.status_str === "error") {
        const errMsg = st.messages?.find((m: any) => m[0] === "execution_error");
        return { error: errMsg ? errMsg[1]?.exception_message?.slice(0, 140) : "Generation failed" };
      }
      // Completed without any text output → ComfyUI cached a previous run and
      // dropped outputs. Don't block the UI forever.
      if (st?.status_str === "success") {
        return { error: "No text output (cached). Try again." };
      }
    } catch { /* keep polling */ }
  }
  return { error: "Timeout" };
}

function DescribeNode({ id, data, selected }: NodeProps) {
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
  // Local copy — avoids cursor-jump caused by controlled value round-tripping
  // through zustand → React Flow → data prop. Sync back from store only when
  // the value changes externally (e.g., Analyze returns a new caption).
  const [localText, setLocalText] = useState(storedText);
  const lastWriteRef = useRef(storedText);
  useEffect(() => {
    if (storedText !== lastWriteRef.current) {
      setLocalText(storedText);
      lastWriteRef.current = storedText;
    }
  }, [storedText]);
  const result = localText;
  const model: DescribeModel = nodeData.widgetValues?.model || "joycaption";
  const task: string = nodeData.widgetValues?.task || "detailed_caption";
  const captionType: string = nodeData.widgetValues?.captionType || "Descriptive";
  const captionLength: string = nodeData.widgetValues?.captionLength || "medium-length";

  const handleRun = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    setError(null);
    const startTime = Date.now();
    log("Describe started", { nodeId: id, nodeType: "fs:describe", nodeLabel: "Describe" });

    const wv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const imgEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "input");
    if (!imgEdge) { setError("Connect a source image"); setProcessing(false); return; }
    const srcUrl = getConnectedImageUrl(id, "input", nodesAll as any[], edgesAll as any[]);
    if (!srcUrl) { setError("No image in source"); setProcessing(false); return; }

    try {
      // Unique filename per run — prevents ComfyUI caching that produces empty outputs
      const imgName = await uploadSourceImage(srcUrl, `fs_describe_${imgEdge.source}_${Date.now()}.png`);
      const seed = wv.seed ? parseInt(wv.seed) : Math.floor(Math.random() * 2147483647);
      let workflow: Record<string, any>;
      const chosenModel: DescribeModel = wv.model || "joycaption";

      if (chosenModel === "florence2") {
        workflow = buildDescribeWorkflow({
          model: "florence2",
          imageName: imgName,
          florenceModel: wv.florenceModel || "microsoft/Florence-2-base",
          task: wv.task || "detailed_caption",
          textInput: wv.textInput || "",
          maxNewTokens: wv.maxNewTokens ?? 1024,
          numBeams: wv.numBeams ?? 3,
          doSample: wv.doSample ?? false,
          seed,
          precision: wv.precision || "fp16",
          keepLoaded: wv.keepLoaded ?? true,
        });
      } else {
        const extras: Record<string, boolean> = {};
        for (const k of Object.keys(JOY_EXTRAS_KEYS)) extras[k] = !!wv[`extra_${k}`];
        workflow = buildDescribeWorkflow({
          model: "joycaption",
          imageName: imgName,
          joyModel: wv.joyModel || "unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit",
          captionType: wv.captionType || "Descriptive",
          captionLength: wv.captionLength || "medium-length",
          personName: wv.personName || "",
          customPrompt: wv.customPrompt || "",
          lowVram: wv.lowVram ?? false,
          topP: wv.topP ?? 0.9,
          temperature: wv.temperature ?? 0.6,
          extras,
        });
      }

      const r = await queuePrompt(workflow);
      const pr = await pollForText(r.prompt_id);
      if (typeof pr === "object" && "error" in pr) {
        setError(pr.error);
        setProcessing(false);
        return;
      }
      const text = pr as string;
      updateWidgetValue(id, "text", text);
      updateWidgetValue(id, "_genTime", Date.now() - startTime);
      log("Describe complete", { nodeId: id, nodeType: "fs:describe", nodeLabel: "Describe", status: "success", details: text.slice(0, 80) });
    } catch (err: any) {
      setError(err.message);
    }
    setProcessing(false);
  }, [id, edgesAll, nodesAll, updateWidgetValue]);

  const imgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "TEXT" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(imgHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  const subtitle =
    model === "florence2"
      ? `Florence-2 · ${task}`
      : `JoyCaption · ${captionType} · ${captionLength}`;

  return (
    <div
      className={`describe-node nanob-node ${selected ? "selected" : ""} ${dimClass}`}
      style={{
        width: 420,
        borderColor: selected ? "#3b82f6" : undefined,
        boxShadow: selected
          ? "0 0 0 1px #3b82f6, 0 0 20px rgba(59,130,246,0.35), 0 8px 24px rgba(0,0,0,0.4)"
          : undefined,
      }}
      onClick={() => setSelectedNode(id)}
    >
      <div className="nanob-node-inner">
        <div className="nanob-accent" style={{ background: "#3b82f6" }} />
        <div className="nanob-header">
          <span className="nanob-icon" style={{ background: "rgba(59,130,246,0.15)" }}>📑</span>
          <div className="nanob-header-text">
            <span className="nanob-title">Describe</span>
            <span className="nanob-status" style={{ color: "#3b82f6" }}>
              {processing ? "ANALYZING..." : subtitle}
            </span>
          </div>
        </div>
      </div>

      <div className="nanob-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="input" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Source Image</span>
        </div>
      </div>

      <textarea
        ref={useAutoGrowTextarea(result)}
        className="describe-result nodrag nowheel"
        value={result}
        placeholder="Connect an image and click Analyze"
        spellCheck={false}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const v = e.target.value;
          setLocalText(v);
          lastWriteRef.current = v;
          updateWidgetValue(id, "text", v);
        }}
        style={{
          display: "block",
          width: "calc(100% - 24px)",
          boxSizing: "border-box",
          margin: "8px 12px",
          padding: "10px 12px",
          minHeight: 150,
          maxHeight: 600,
          resize: "vertical",
          overflowY: "auto",
          background: "rgba(59,130,246,0.06)",
          border: "1px solid rgba(59,130,246,0.22)",
          borderRadius: 6,
          fontSize: 12,
          lineHeight: 1.5,
          color: "#cfcfe8",
          whiteSpace: "pre-wrap",
          fontFamily: "inherit",
          outline: "none",
        }}
      />

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button
          className={`nanob-generate-btn ${processing ? "generating" : ""}data-fs-run-id={id} `}
          style={{ background: processing ? "#2a5a8f" : "#3b82f6", color: "#fff" }}
          onClick={handleRun}
          disabled={processing}
        >
          {processing ? "Analyzing..." : "🔍 Analyze image"}
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

export default memo(DescribeNode);
