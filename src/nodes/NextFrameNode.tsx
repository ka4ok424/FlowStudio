import { memo, useCallback, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt } from "../api/comfyApi";
import { log } from "../store/logStore";
import { uploadSourceImage, pollForResult, fetchAsDataUrl, saveGenerationResult, getConnectedImageUrl, getConnectedPrompt } from "../hooks/useNodeHelpers";
import { buildNextFrameWorkflow } from "../workflows/nextFrame";
import MediaHistory from "./MediaHistory";

function NextFrameNode({ id, data, selected }: NodeProps) {
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

  const handleGenerate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    setError(null);
    const startTime = Date.now();
    log("Next Frame started", { nodeId: id, nodeType: "fs:nextFrame", nodeLabel: "Next Frame" });

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const steps = freshWv.steps || 8;
    const cfg = freshWv.cfg ?? 1.2;
    const denoise = freshWv.denoise ?? 0.35;
    const seed = freshWv.seed ? parseInt(freshWv.seed) : Math.floor(Math.random() * 2147483647);
    const negativePrompt = freshWv.negativePrompt || "";

    const promptText = getConnectedPrompt(id, nodesAll as any[], edgesAll as any[]);
    if (!promptText) { setError("Connect a Prompt node"); setProcessing(false); return; }

    const imgEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "input");
    if (!imgEdge) { setError("Connect a source frame"); setProcessing(false); return; }
    const srcUrl = getConnectedImageUrl(id, "input", nodesAll as any[], edgesAll as any[]);
    if (!srcUrl) { setError("No image in source"); setProcessing(false); return; }

    try {
      const imgName = await uploadSourceImage(srcUrl, `fs_nf_${imgEdge.source}.png`);
      const workflow = buildNextFrameWorkflow({ imageName: imgName, prompt: promptText, negativePrompt, seed, steps, cfg, denoise });
      const result = await queuePrompt(workflow);

      const pollResult = await pollForResult(result.prompt_id);
      if (!pollResult || "error" in pollResult) {
        setError(pollResult ? pollResult.error : "No result");
        setProcessing(false);
        return;
      }

      const dataUrl = await fetchAsDataUrl(pollResult.apiUrl);
      updateWidgetValue(id, "_lastSeed", seed);
      await saveGenerationResult(id, dataUrl, Date.now() - startTime, {
        prompt: promptText, model: "Klein 9B (next frame)", seed: String(seed), steps, cfg, nodeType: "fs:nextFrame",
      });
      log("Next Frame complete", { nodeId: id, nodeType: "fs:nextFrame", nodeLabel: "Next Frame", status: "success" });
    } catch (err: any) {
      setError(err.message);
    }
    setProcessing(false);
  }, [id, edgesAll, nodesAll, updateWidgetValue]);

  const imgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const promptHL = connectingDir === "source" && (connectingType === "TEXT" || connectingType === "*") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(imgHL || promptHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  return (
    <div className={`nextframe-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="nextframe-node-inner">
        <div className="nextframe-accent" />
        <div className="nextframe-header">
          <span className="nextframe-icon">🎞️</span>
          <div className="nextframe-header-text">
            <span className="nextframe-title">Next Frame</span>
            <span className="nextframe-status">{processing ? "GENERATING..." : "Klein 9B"}</span>
          </div>
        </div>
      </div>

      <div className="nextframe-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="prompt" className={`slot-handle ${promptHL}`} style={{ color: "#f0c040" }} />
          <TypeBadge color="#f0c040">TXT</TypeBadge>
          <span className="nanob-input-label">Frame Prompt</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="input" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Previous Frame</span>
        </div>
      </div>

      <MediaHistory nodeId={id} history={nodeData.widgetValues?._history || []} historyIndex={nodeData.widgetValues?._historyIndex ?? -1} fallbackUrl={previewUrl} emptyIcon="🎞️" genTime={nodeData.widgetValues?._genTime} />

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button className={`localgen-generate-btn ${processing ? "generating" : ""}`} onClick={handleGenerate} disabled={processing}>
          {processing ? "Generating..." : "🎞️ Generate Frame"}
        </button>
      </div>

      <div className="nextframe-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-output-label">Frame</span>
          <Handle type="source" position={Position.Right} id="output_0" className={`slot-handle ${outputHL}`} style={{ color: "#64b5f6" }} />
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="type-badge" style={{ color, borderColor: color + "66", backgroundColor: color + "12" }}>{children}</span>;
}

export default memo(NextFrameNode);
