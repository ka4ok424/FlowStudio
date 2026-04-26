import { memo, useCallback, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt } from "../api/comfyApi";
import { log } from "../store/logStore";
import { uploadSourceImage, pollForResult, fetchAsDataUrl, saveGenerationResult, getConnectedImageUrl } from "../hooks/useNodeHelpers";
import { buildEnhanceWorkflow } from "../workflows/enhance";
import MediaHistory from "./MediaHistory";

function EnhanceNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const previewUrl = nodeData.widgetValues?._previewUrl || null;
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEnhance = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    setError(null);
    const startTime = Date.now();
    log("Quality started", { nodeId: id, nodeType: "fs:enhance", nodeLabel: "Quality" });

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const scale = freshWv.scale ?? 2;
    const steps = freshWv.steps || 20;
    const cfg = freshWv.cfg ?? 4.0;
    const restoration = freshWv.restoration ?? 1.0;
    const seed = freshWv.seed ? parseInt(freshWv.seed) : Math.floor(Math.random() * 2147483647);
    const prompt = freshWv.prompt || "high quality, detailed, sharp";
    const negPrompt = freshWv.negPrompt || "blurry, noise, artifacts, low quality";
    const colorFix = freshWv.colorFix || "AdaIn";

    const imgEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "input");
    if (!imgEdge) { setError("Connect an image"); setProcessing(false); return; }
    const srcUrl = getConnectedImageUrl(id, "input", nodesAll as any[], edgesAll as any[]);
    if (!srcUrl) { setError("No image in source"); setProcessing(false); return; }

    try {
      const imgName = await uploadSourceImage(srcUrl, `fs_enh_${imgEdge.source}.png`);
      const workflow = buildEnhanceWorkflow({ imageName: imgName, scale, steps, restoration, cfg, prompt, negPrompt, colorFix, seed });
      const result = await queuePrompt(workflow);

      const pollResult = await pollForResult(result.prompt_id, { interval: 2000 });
      if (!pollResult || "error" in pollResult) {
        setError(pollResult ? pollResult.error : "No result");
        setProcessing(false);
        return;
      }

      const dataUrl = await fetchAsDataUrl(pollResult.apiUrl);
      await saveGenerationResult(id, dataUrl, Date.now() - startTime, {
        prompt, model: "SUPIR", seed: String(seed), steps, cfg, nodeType: "fs:enhance",
      });
      log("Quality complete", { nodeId: id, nodeType: "fs:enhance", nodeLabel: "Quality", status: "success" });
    } catch (err: any) {
      setError(err.message);
    }
    setProcessing(false);
  }, [id, edgesAll, nodesAll]);

  const imgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(imgHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  return (
    <div className={`quality-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="quality-node-inner">
        <div className="quality-accent" />
        <div className="quality-header">
          <span className="quality-icon">✨</span>
          <div className="quality-header-text">
            <span className="quality-title">Quality</span>
            <span className="quality-status">{processing ? "ENHANCING..." : "SUPIR"}</span>
          </div>
        </div>
      </div>

      <div className="quality-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="input" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Image</span>
        </div>
      </div>

      <MediaHistory nodeId={id} history={nodeData.widgetValues?._history || []} historyIndex={nodeData.widgetValues?._historyIndex ?? -1} fallbackUrl={previewUrl} emptyIcon="✨" genTime={nodeData.widgetValues?._genTime} />

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button className={`localgen-generate-btn ${processing ? "generating" : ""}`} onClick={handleEnhance} disabled={processing}>
          {processing ? "Enhancing..." : "✨ Quality"}
        </button>
      </div>

      <div className="quality-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-output-label">Enhanced</span>
          <Handle type="source" position={Position.Right} id="output_0" className={`slot-handle ${outputHL}`} style={{ color: "#64b5f6" }} />
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="type-badge" style={{ color, borderColor: color + "66", backgroundColor: color + "12" }}>{children}</span>;
}

export default memo(EnhanceNode);
