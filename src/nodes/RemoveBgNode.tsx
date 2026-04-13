import { memo, useCallback, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt } from "../api/comfyApi";
import { log } from "../store/logStore";
import { uploadSourceImage, pollForResult, fetchAsDataUrl, saveGenerationResult, getConnectedImageUrl } from "../hooks/useNodeHelpers";
import { buildRemoveBgWorkflow } from "../workflows/removeBg";
import MediaHistory from "./MediaHistory";

function RemoveBgNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const previewUrl = nodeData.widgetValues?._previewUrl || null;
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRemove = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    setError(null);
    const startTime = Date.now();
    log("Remove BG started", { nodeId: id, nodeType: "fs:removeBg", nodeLabel: "Remove BG" });

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const model = freshWv.model || "BiRefNet-general";

    const imgEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "input");
    if (!imgEdge) { setError("Connect an image"); setProcessing(false); return; }
    const srcUrl = getConnectedImageUrl(id, "input", nodesAll as any[], edgesAll as any[]);
    if (!srcUrl) { setError("No image in source"); setProcessing(false); return; }

    try {
      const imgName = await uploadSourceImage(srcUrl, `fs_rmbg_${imgEdge.source}.png`);
      const workflow = buildRemoveBgWorkflow({ imageName: imgName, model });
      const result = await queuePrompt(workflow);

      const pollResult = await pollForResult(result.prompt_id);
      if (!pollResult || "error" in pollResult) {
        setError(pollResult ? pollResult.error : "No result");
        log("Remove BG failed", { nodeId: id, nodeType: "fs:removeBg", nodeLabel: "Remove BG", status: "error" });
        setProcessing(false);
        return;
      }

      const dataUrl = await fetchAsDataUrl(pollResult.apiUrl);
      await saveGenerationResult(id, dataUrl, Date.now() - startTime, {
        prompt: `Remove BG (${model})`, model, seed: "n/a", nodeType: "fs:removeBg",
      });
      log("Remove BG complete", { nodeId: id, nodeType: "fs:removeBg", nodeLabel: "Remove BG", status: "success", details: model });
    } catch (err: any) {
      setError(err.message);
    }
    setProcessing(false);
  }, [id, edgesAll, nodesAll]);

  const imgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(imgHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  const currentModel = nodeData.widgetValues?.model || "BiRefNet-general";

  return (
    <div className={`removebg-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="removebg-node-inner">
        <div className="removebg-accent" />
        <div className="removebg-header">
          <span className="removebg-icon">✂️</span>
          <div className="removebg-header-text">
            <span className="removebg-title">Remove BG</span>
            <span className="removebg-status">{processing ? "PROCESSING..." : currentModel}</span>
          </div>
        </div>
      </div>

      <div className="removebg-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="input" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Image</span>
        </div>
      </div>

      <MediaHistory nodeId={id} history={nodeData.widgetValues?._history || []} historyIndex={nodeData.widgetValues?._historyIndex ?? -1} fallbackUrl={previewUrl} emptyIcon="✂️" genTime={nodeData.widgetValues?._genTime} />

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button className={`localgen-generate-btn ${processing ? "generating" : ""}`} onClick={handleRemove} disabled={processing}>
          {processing ? "Removing..." : "✂️ Remove Background"}
        </button>
      </div>

      <div className="removebg-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-output-label">Image</span>
          <Handle type="source" position={Position.Right} id="output_0" className={`slot-handle ${outputHL}`} style={{ color: "#64b5f6" }} />
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="type-badge" style={{ color, borderColor: color + "66", backgroundColor: color + "12" }}>{children}</span>;
}

export default memo(RemoveBgNode);
