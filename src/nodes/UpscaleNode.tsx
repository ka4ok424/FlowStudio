import { memo, useCallback, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt } from "../api/comfyApi";
import { log } from "../store/logStore";
import { uploadSourceImage, pollForResult, fetchAsDataUrl, saveGenerationResult, getConnectedImageUrl } from "../hooks/useNodeHelpers";
import { buildUpscaleWorkflow } from "../workflows/upscale";
import MediaHistory from "./MediaHistory";

function UpscaleNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const previewUrl = nodeData.widgetValues?._previewUrl || null;
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpscale = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    setError(null);
    const startTime = Date.now();
    log("Upscale started", { nodeId: id, nodeType: "fs:upscale", nodeLabel: "Upscale" });

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const scale = freshWv.scale || 2;
    const method = freshWv.method || "ai_ultrasharp";

    const imgEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "input");
    if (!imgEdge) { setError("Connect an image source"); setProcessing(false); return; }
    const srcUrl = getConnectedImageUrl(id, "input", nodesAll as any[], edgesAll as any[]);
    if (!srcUrl) { setError("No image in source. Generate first."); setProcessing(false); return; }

    try {
      const imgName = await uploadSourceImage(srcUrl, `fs_up_${imgEdge.source}.png`);
      const workflow = buildUpscaleWorkflow({ imageName: imgName, method, scale });
      const result = await queuePrompt(workflow);

      const pollResult = await pollForResult(result.prompt_id);
      if (!pollResult || "error" in pollResult) {
        setError(pollResult ? pollResult.error : "No result");
        setProcessing(false);
        return;
      }

      const dataUrl = await fetchAsDataUrl(pollResult.apiUrl);
      await saveGenerationResult(id, dataUrl, Date.now() - startTime, {
        prompt: `Upscale ${scale}x ${method}`, model: method.startsWith("ai_") ? method : "ImageScaleBy",
        seed: "n/a", nodeType: "fs:upscale",
      });
      log("Upscale complete", { nodeId: id, nodeType: "fs:upscale", nodeLabel: "Upscale", status: "success", details: `${scale}x ${method}` });
    } catch (err: any) {
      setError(err.message);
    }
    setProcessing(false);
  }, [id, edgesAll, nodesAll]);

  // Highlighting
  const imgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(imgHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  return (
    <div className={`upscale-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="upscale-node-inner">
        <div className="upscale-accent" />
        <div className="upscale-header">
          <span className="upscale-icon">🔍</span>
          <div className="upscale-header-text">
            <span className="upscale-title">Upscale</span>
            <span className="upscale-status">{processing ? "PROCESSING..." : `${nodeData.widgetValues?.scale || 2}x`}</span>
          </div>
        </div>
      </div>

      <div className="upscale-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="input" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Input</span>
        </div>
      </div>

      <MediaHistory nodeId={id} history={nodeData.widgetValues?._history || []} historyIndex={nodeData.widgetValues?._historyIndex ?? -1} fallbackUrl={previewUrl} emptyIcon="🔍" genTime={nodeData.widgetValues?._genTime} />

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button className={`localgen-generate-btn ${processing ? "generating" : ""}`} onClick={handleUpscale} disabled={processing}>
          {processing ? "Upscaling..." : "🔍 Upscale"}
        </button>
      </div>

      <div className="upscale-outputs">
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

export default memo(UpscaleNode);
