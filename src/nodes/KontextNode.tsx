import { memo, useCallback, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt } from "../api/comfyApi";
import { log } from "../store/logStore";
import { uploadSourceImageCached, pollForResult, fetchAsDataUrl, saveGenerationResult, getConnectedImageUrl, getConnectedPrompt } from "../hooks/useNodeHelpers";
import { buildKontextWorkflow } from "../workflows/kontext";
import MediaHistory from "./MediaHistory";

function KontextNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const previewUrl = nodeData.widgetValues?._previewUrl || null;
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchInfo, setBatchInfo] = useState<{ done: number; total: number } | null>(null);
  const count: number = Math.max(1, Math.min(20, nodeData.widgetValues?.count ?? 1));

  const handleGenerate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    setError(null);

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const steps = freshWv.steps || 24;
    const cfg = freshWv.cfg ?? 3.5;
    const sampler = freshWv.sampler || "euler";
    const scheduler = freshWv.scheduler || "simple";
    const nRuns: number = Math.max(1, Math.min(20, freshWv.count ?? 1));

    const promptText = getConnectedPrompt(id, nodesAll as any[], edgesAll as any[]);
    if (!promptText) { setError("Connect a Prompt node"); setProcessing(false); return; }
    const imgEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "input");
    if (!imgEdge) { setError("Connect a source image"); setProcessing(false); return; }
    const srcUrl = getConnectedImageUrl(id, "input", nodesAll as any[], edgesAll as any[]);
    if (!srcUrl) { setError("No image in source. Generate first."); setProcessing(false); return; }

    log(`Kontext started${nRuns > 1 ? ` ×${nRuns}` : ""}`, { nodeId: id, nodeType: "fs:kontext", nodeLabel: "Kontext" });

    try {
      const imgName = await uploadSourceImageCached(srcUrl, "fs_ktx");
      const imgDims = await new Promise<{w:number,h:number}>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: Math.max(768, Math.round(img.width / 64) * 64) || 1024, h: Math.max(768, Math.round(img.height / 64) * 64) || 1024 });
        img.onerror = () => resolve({ w: 1024, h: 1024 });
        img.src = srcUrl;
      });

      for (let i = 0; i < nRuns; i++) {
        if (nRuns > 1) setBatchInfo({ done: i, total: nRuns });
        const startTime = Date.now();
        const seed = nRuns > 1
          ? Math.floor(Math.random() * 2147483647)
          : (freshWv.seed ? parseInt(freshWv.seed) : Math.floor(Math.random() * 2147483647));
        const workflow = buildKontextWorkflow({
          imageName: imgName, prompt: promptText, seed, steps, cfg,
          sampler, scheduler, width: imgDims.w, height: imgDims.h,
        });
        const result = await queuePrompt(workflow);
        const pollResult = await pollForResult(result.prompt_id);
        if (!pollResult || "error" in pollResult) {
          setError(pollResult ? pollResult.error : "No result");
          break;
        }
        const dataUrl = await fetchAsDataUrl(pollResult.apiUrl);
        await saveGenerationResult(id, dataUrl, Date.now() - startTime, {
          prompt: promptText, model: "FLUX.1 Kontext", seed: String(seed), steps, cfg, nodeType: "fs:kontext",
        });
        log(`Kontext done${nRuns > 1 ? ` (${i + 1}/${nRuns})` : ""}`, {
          nodeId: id, nodeType: "fs:kontext", nodeLabel: "Kontext",
          status: "success", details: `seed ${seed}`,
        });
      }
    } catch (err: any) {
      setError(err.message);
    }
    setBatchInfo(null);
    setProcessing(false);
  }, [id, edgesAll, nodesAll]);

  const imgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const promptHL = connectingDir === "source" && (connectingType === "TEXT" || connectingType === "*") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(imgHL || promptHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  return (
    <div className={`kontext-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="kontext-node-inner">
        <div className="kontext-accent" />
        <div className="kontext-header">
          <span className="kontext-icon">✏️</span>
          <div className="kontext-header-text">
            <span className="kontext-title">Kontext</span>
            <span className="kontext-status">
              {processing
                ? (batchInfo ? `BATCH ${batchInfo.done + 1}/${batchInfo.total}` : "EDITING...")
                : (count > 1 ? `FLUX.1 · ×${count}` : "FLUX.1")}
            </span>
          </div>
        </div>
      </div>

      <div className="kontext-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="prompt" className={`slot-handle ${promptHL}`} style={{ color: "#f0c040" }} />
          <TypeBadge color="#f0c040">TXT</TypeBadge>
          <span className="nanob-input-label">Edit Prompt</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="input" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Source Image</span>
        </div>
      </div>

      <MediaHistory nodeId={id} history={nodeData.widgetValues?._history || []} historyIndex={nodeData.widgetValues?._historyIndex ?? -1} fallbackUrl={previewUrl} emptyIcon="✏️" genTime={nodeData.widgetValues?._genTime} />

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button className={`localgen-generate-btn ${processing ? "generating" : ""}data-fs-run-id={id} `} onClick={handleGenerate} disabled={processing}>
          {processing ? "Editing..." : "✏️ Edit Image"}
        </button>
      </div>

      <div className="kontext-outputs">
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

export default memo(KontextNode);
