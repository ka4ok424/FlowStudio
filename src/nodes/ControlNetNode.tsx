import { memo, useCallback, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt } from "../api/comfyApi";
import { log } from "../store/logStore";
import { uploadSourceImage, pollForResult, fetchAsDataUrl, saveGenerationResult, getConnectedImageUrl, getConnectedPrompt } from "../hooks/useNodeHelpers";
import { buildControlNetWorkflow } from "../workflows/controlNet";
import MediaHistory from "./MediaHistory";

const CONTROL_TYPES = [
  { value: "canny", label: "Canny (edges)" },
  { value: "soft_edge", label: "Soft Edge" },
  { value: "depth", label: "Depth" },
  { value: "pose", label: "Pose" },
  { value: "gray", label: "Gray (style)" },
];

function ControlNetNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
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
    log("ControlNet started", { nodeId: id, nodeType: "fs:controlNet", nodeLabel: "ControlNet" });

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const steps = freshWv.steps || 20;
    const cfg = freshWv.cfg ?? 3.5;
    const width = freshWv.width || 1024;
    const height = freshWv.height || 1024;
    const seed = freshWv.seed ? parseInt(freshWv.seed) : Math.floor(Math.random() * 2147483647);
    const strength = freshWv.strength ?? 0.7;
    const startPercent = freshWv.startPercent ?? 0.0;
    const endPercent = freshWv.endPercent ?? 1.0;
    const controlType = freshWv.controlType || "canny";
    const cannyLow = freshWv.cannyLow ?? 0.4;
    const cannyHigh = freshWv.cannyHigh ?? 0.8;

    const promptText = getConnectedPrompt(id, nodesAll as any[], edgesAll as any[]);
    if (!promptText) { setError("Connect a Prompt node"); setProcessing(false); return; }

    const imgEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "input");
    if (!imgEdge) { setError("Connect a reference image"); setProcessing(false); return; }
    const srcUrl = getConnectedImageUrl(id, "input", nodesAll as any[], edgesAll as any[]);
    if (!srcUrl) { setError("No image in source"); setProcessing(false); return; }

    try {
      const imgName = await uploadSourceImage(srcUrl, `fs_cn_${imgEdge.source}.png`);
      const workflow = buildControlNetWorkflow({
        imageName: imgName, prompt: promptText, seed, steps, cfg,
        width, height, strength, startPercent, endPercent,
        controlType, cannyLow, cannyHigh,
      });

      const result = await queuePrompt(workflow);
      const pollResult = await pollForResult(result.prompt_id);
      if (!pollResult || "error" in pollResult) {
        setError(pollResult ? pollResult.error : "No result");
        setProcessing(false);
        return;
      }

      const dataUrl = await fetchAsDataUrl(pollResult.apiUrl);
      await saveGenerationResult(id, dataUrl, Date.now() - startTime, {
        prompt: promptText, model: `ControlNet ${controlType}`, seed: String(seed),
        steps, cfg, width, height, nodeType: "fs:controlNet",
      });
      log("ControlNet complete", { nodeId: id, nodeType: "fs:controlNet", nodeLabel: "ControlNet", status: "success", details: controlType });
    } catch (err: any) {
      setError(err.message);
    }
    setProcessing(false);
  }, [id, edgesAll, nodesAll]);

  const imgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const promptHL = connectingDir === "source" && (connectingType === "TEXT" || connectingType === "*") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(imgHL || promptHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  const controlType = nodeData.widgetValues?.controlType || "canny";

  return (
    <div className={`controlnet-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="controlnet-node-inner">
        <div className="controlnet-accent" />
        <div className="controlnet-header">
          <span className="controlnet-icon">🎯</span>
          <div className="controlnet-header-text">
            <span className="controlnet-title">ControlNet</span>
            <span className="controlnet-status">{processing ? "GENERATING..." : "FLUX.1 Dev"}</span>
          </div>
        </div>
      </div>

      <div className="controlnet-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="prompt" className={`slot-handle ${promptHL}`} style={{ color: "#f0c040" }} />
          <TypeBadge color="#f0c040">TXT</TypeBadge>
          <span className="nanob-input-label">Prompt</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="input" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Reference Image</span>
        </div>
      </div>

      <MediaHistory nodeId={id} history={nodeData.widgetValues?._history || []} historyIndex={nodeData.widgetValues?._historyIndex ?? -1} fallbackUrl={previewUrl} emptyIcon="🎯" genTime={nodeData.widgetValues?._genTime} />

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button className={`localgen-generate-btn ${processing ? "generating" : ""}`} onClick={handleGenerate} disabled={processing}>
          {processing ? "Generating..." : "🎯 Generate with ControlNet"}
        </button>
      </div>

      <div className="controlnet-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-output-label">Output</span>
          <Handle type="source" position={Position.Right} id="output_0" className={`slot-handle ${outputHL}`} style={{ color: "#64b5f6" }} />
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="type-badge" style={{ color, borderColor: color + "66", backgroundColor: color + "12" }}>{children}</span>;
}

export default memo(ControlNetNode);
