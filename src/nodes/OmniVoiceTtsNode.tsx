import { memo, useCallback, useState, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt, getImageUrl, getComfyUrl, stopAll } from "../api/comfyApi";
import { addGenerationToLibrary } from "../store/mediaStore";
import MediaHistory from "./MediaHistory";
import { addToHistory } from "../utils/historyLimit";
import { log } from "../store/logStore";
import { buildOmniVoiceTtsWorkflow } from "../workflows/omnivoiceTts";

function OmniVoiceTtsNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const previewUrl = nodeData.widgetValues?._previewUrl || null;
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const handleGenerate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    setError(null);
    abortRef.current = false;
    const startTime = Date.now();

    let promptText = "";
    const promptEdge = edgesAll.find((ed) => ed.target === id && ed.targetHandle === "text");
    if (promptEdge) {
      const srcNode = nodesAll.find((n) => n.id === promptEdge.source);
      if (srcNode) promptText = (srcNode.data as any).widgetValues?.text || "";
    }
    if (!promptText) promptText = nodeData.widgetValues?.text || "";
    if (!promptText) { setError("Connect a Prompt node with text"); setProcessing(false); return; }

    const wv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const language = wv.language || "Auto";
    const numStep = wv.numStep ?? 32;
    const guidanceScale = wv.guidanceScale ?? 2.0;
    const denoise = wv.denoise ?? true;
    const preprocessPrompt = wv.preprocessPrompt ?? true;
    const postprocessOutput = wv.postprocessOutput ?? true;
    const speed = wv.speed ?? 1.0;
    const duration = wv.duration ?? 0;
    const seed = wv.seed ? parseInt(wv.seed) : Math.floor(Math.random() * 2147483647);
    const instruct = wv.instruct || "";
    const modelPath = wv.modelPath || "omnivoice";
    const precision: "fp16" | "bf16" | "fp32" = wv.precision || "fp16";
    const loadAsr = wv.loadAsr ?? true;

    log("OmniVoice TTS rendering", { nodeId: id, nodeType: "fs:omnivoiceTts", nodeLabel: "OmniVoice TTS" });

    try {
      const workflow = buildOmniVoiceTtsWorkflow({
        text: promptText, language,
        numStep, guidanceScale, denoise, preprocessPrompt, postprocessOutput,
        speed, duration, seed, instruct,
        modelPath, precision, loadAsr,
      });

      const result = await queuePrompt(workflow);
      const promptId = result.prompt_id;

      for (let attempt = 0; attempt < 600; attempt++) {
        if (abortRef.current) { setError("Stopped"); setProcessing(false); return; }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          const histRes = await fetch(`${getComfyUrl()}/api/history/${promptId}`);
          if (!histRes.ok) continue;
          const history = await histRes.json();
          if (history[promptId]) {
            const outputs = history[promptId].outputs;
            for (const nId of Object.keys(outputs || {})) {
              const media = outputs[nId]?.audio || outputs[nId]?.audios;
              if (media && media.length > 0) {
                const a = media[0];
                const apiUrl = getImageUrl(a.filename, a.subfolder, a.type);
                updateWidgetValue(id, "_genTime", Date.now() - startTime);
                updateWidgetValue(id, "_previewUrl", apiUrl);
                const prevHist: string[] = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues?._history || [];
                const { history: newHist, index: newIdx } = await addToHistory(id, prevHist, apiUrl);
                updateWidgetValue(id, "_history", newHist);
                updateWidgetValue(id, "_historyIndex", newIdx);
                log("OmniVoice TTS complete", { nodeId: id, nodeType: "fs:omnivoiceTts", nodeLabel: "OmniVoice TTS", status: "success", details: `${numStep}st cfg${guidanceScale}` });
                addGenerationToLibrary(apiUrl, {
                  prompt: promptText, model: "OmniVoice (k2-fsa)", seed: String(seed),
                  steps: numStep, cfg: guidanceScale, width: 0, height: 0, nodeType: "fs:omnivoiceTts",
                  duration: Date.now() - startTime,
                }, "audio");
                setProcessing(false);
                return;
              }
            }
            const st = history[promptId].status;
            if (st?.completed || st?.status_str === "error") {
              const errMsg = history[promptId].status?.messages?.find((m: any) => m[0] === "execution_error");
              setError(errMsg ? errMsg[1]?.exception_message?.slice(0, 160) : "Generation failed");
              log("OmniVoice TTS failed", { nodeId: id, nodeType: "fs:omnivoiceTts", nodeLabel: "OmniVoice TTS", status: "error" });
              setProcessing(false);
              return;
            }
          }
        } catch { /* keep polling */ }
      }
      setError("Timeout"); setProcessing(false);
    } catch (err: any) {
      setError(err.message);
      log("OmniVoice TTS error", { nodeId: id, nodeType: "fs:omnivoiceTts", nodeLabel: "OmniVoice TTS", status: "error", details: err.message });
      setProcessing(false);
    }
  }, [id, edgesAll, nodesAll, nodeData.widgetValues, updateWidgetValue]);

  const textHL = connectingDir === "source" && (connectingType === "TEXT" || connectingType === "*") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "AUDIO" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(textHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  const wv = nodeData.widgetValues || {};
  const language = wv.language || "Auto";
  const numStep = wv.numStep ?? 32;

  return (
    <div className={`mmaudio-node omnivoice-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="mmaudio-node-inner">
        <div className="mmaudio-accent" style={{ background: "#9c6cd9" }} />
        <div className="mmaudio-header">
          <span className="mmaudio-icon">🗣️</span>
          <div className="mmaudio-header-text">
            <span className="mmaudio-title">OmniVoice TTS</span>
            <span className="mmaudio-status">{processing ? "GENERATING..." : `${language} · ${numStep}st`}</span>
          </div>
        </div>
      </div>

      <div className="mmaudio-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="text" className={`slot-handle ${textHL}`} style={{ color: "#f0c040" }} />
          <TypeBadge color="#f0c040">TXT</TypeBadge>
          <span className="nanob-input-label">Text</span>
        </div>
      </div>

      <MediaHistory
        nodeId={id}
        history={nodeData.widgetValues?._history || []}
        historyIndex={nodeData.widgetValues?._historyIndex ?? -1}
        fallbackUrl={previewUrl}
        emptyIcon="🗣️"
        mediaType="audio"
        genTime={nodeData.widgetValues?._genTime}
      />

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        {processing ? (
          <button className="localgen-generate-btn generating" onClick={(e) => {
            e.stopPropagation();
            abortRef.current = true;
            stopAll().catch(() => {});
          }}>
            Stop
          </button>
        ) : (
          <button className="localgen-generate-btn" onClick={handleGenerate} disabled={processing} style={{ flex: 1 }}>
            🗣️ Generate Speech
          </button>
        )}
      </div>

      <a
        href="https://github.com/k2-fsa/OmniVoice"
        target="_blank"
        rel="noopener noreferrer"
        className="omni-update-link nodrag"
        onClick={(e) => e.stopPropagation()}
        title="OmniVoice is actively updated. Tail-clipping and other quirks may already be fixed."
      >
        ⓘ Model updates often — check GitHub for fixes
      </a>

      <div className="mmaudio-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <TypeBadge color="#ec4899">AUD</TypeBadge>
          <span className="nanob-output-label">Audio</span>
          <Handle type="source" position={Position.Right} id="output_0" className={`slot-handle ${outputHL}`} style={{ color: "#ec4899" }} />
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="type-badge" style={{ color, borderColor: color + "66", backgroundColor: color + "12" }}>{children}</span>;
}

export default memo(OmniVoiceTtsNode);
