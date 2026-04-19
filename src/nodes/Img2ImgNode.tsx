import { memo, useCallback, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt } from "../api/comfyApi";
import { log } from "../store/logStore";
import { uploadSourceImageCached, pollForResult, fetchAsDataUrl, saveGenerationResult, getConnectedImageUrl, getConnectedPrompt } from "../hooks/useNodeHelpers";
import { buildImg2ImgWorkflow } from "../workflows/img2img";
import MediaHistory from "./MediaHistory";

const DEFAULT_REFS = 6;
const MAX_REFS = 10;

function Img2ImgNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const previewUrl = nodeData.widgetValues?._previewUrl || null;
  const [processing, setProcessing] = useState(false);
  const [batchInfo, setBatchInfo] = useState<{ done: number; total: number } | null>(null);
  const count: number = Math.max(1, Math.min(20, nodeData.widgetValues?.count ?? 1));
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    setError(null);

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const steps = freshWv.steps || 28;
    const cfg = freshWv.cfg ?? 3.5;
    const denoise = freshWv.denoise ?? 0.75;
    const width = freshWv.width || 1024;
    const height = freshWv.height || 1024;
    const negativePrompt = freshWv.negativePrompt || "";
    const sampler = freshWv.sampler || "euler";
    const scheduler = freshWv.scheduler || "simple";
    const kvCache = freshWv.kvCache || false;
    const nRuns: number = Math.max(1, Math.min(20, freshWv.count ?? 1));

    const promptText = getConnectedPrompt(id, nodesAll as any[], edgesAll as any[]);
    if (!promptText) { setError("Connect a Prompt node"); setProcessing(false); return; }

    const curRefCount = freshWv._refCount || DEFAULT_REFS;
    const refUrls: { url: string; sourceId: string }[] = [];
    for (let i = 0; i < curRefCount; i++) {
      const url = getConnectedImageUrl(id, `ref_${i}`, nodesAll as any[], edgesAll as any[]);
      if (url) {
        const edge = edgesAll.find((e) => e.target === id && e.targetHandle === `ref_${i}`);
        if (edge) refUrls.push({ url, sourceId: edge.source });
      }
    }
    if (refUrls.length === 0) { setError("Connect at least 1 reference image"); setProcessing(false); return; }

    log(`Img2Img started${nRuns > 1 ? ` ×${nRuns}` : ""}`, { nodeId: id, nodeType: "fs:img2img", nodeLabel: "Img2Img" });

    try {
      const imgNames: string[] = [];
      for (const { url } of refUrls) {
        // Deterministic filename → re-Generate without changes hits ComfyUI cache.
        imgNames.push(await uploadSourceImageCached(url, "fs_ref"));
      }

      for (let i = 0; i < nRuns; i++) {
        if (nRuns > 1) setBatchInfo({ done: i, total: nRuns });
        const startTime = Date.now();
        const seed = nRuns > 1
          ? Math.floor(Math.random() * 2147483647)
          : (freshWv.seed ? parseInt(freshWv.seed) : Math.floor(Math.random() * 2147483647));

        const workflow = buildImg2ImgWorkflow({
          imageNames: imgNames, prompt: promptText, negativePrompt,
          seed, steps, cfg, denoise, width, height, sampler, scheduler, kvCache,
        });
        const result = await queuePrompt(workflow);
        const pollResult = await pollForResult(result.prompt_id);
        if (!pollResult || "error" in pollResult) {
          setError(pollResult ? pollResult.error : "No result");
          break;
        }
        const dataUrl = await fetchAsDataUrl(pollResult.apiUrl);
        await saveGenerationResult(id, dataUrl, Date.now() - startTime, {
          prompt: promptText, model: "FLUX.2 Dev", seed: String(seed), steps, cfg, width, height, nodeType: "fs:img2img",
        });
        log(`Img2Img done${nRuns > 1 ? ` (${i + 1}/${nRuns})` : ""}`, { nodeId: id, nodeType: "fs:img2img", status: "success", details: `seed ${seed}` });
      }
    } catch (err: any) {
      setError(err.message);
    }
    setBatchInfo(null);
    setProcessing(false);
  }, [id, edgesAll, nodesAll, updateWidgetValue]);

  const imgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const promptHL = connectingDir === "source" && (connectingType === "TEXT" || connectingType === "*") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(imgHL || promptHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  const refCount = nodeData.widgetValues?._refCount || DEFAULT_REFS;

  return (
    <div className={`img2img-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="img2img-node-inner">
        <div className="img2img-accent" />
        <div className="img2img-header">
          <span className="img2img-icon">🎨</span>
          <div className="img2img-header-text">
            <span className="img2img-title">Img2Img</span>
            <span className="img2img-status">
              {processing
                ? (batchInfo ? `BATCH ${batchInfo.done + 1}/${batchInfo.total}` : "PROCESSING...")
                : `FLUX.2 Dev${count > 1 ? ` · ×${count}` : ""}`}
            </span>
          </div>
        </div>
      </div>

      <div className="img2img-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="prompt" className={`slot-handle ${promptHL}`} style={{ color: "#f0c040" }} />
          <TypeBadge color="#f0c040">TXT</TypeBadge>
          <span className="nanob-input-label">Prompt</span>
        </div>
        {Array.from({ length: refCount }, (_, i) => (
          <div key={i} className="nanob-input-row">
            <Handle type="target" position={Position.Left} id={`ref_${i}`} className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
            <TypeBadge color="#64b5f6">IMG</TypeBadge>
            <span className="nanob-input-label">Ref {i + 1}</span>
          </div>
        ))}
        {refCount < MAX_REFS && (
          <div className="nanob-input-row nodrag" style={{ justifyContent: "center" }}>
            <button className="img2img-add-ref-btn"
              onClick={(e) => { e.stopPropagation(); updateWidgetValue(id, "_refCount", refCount + 1); }}>+ Add Ref</button>
          </div>
        )}
      </div>

      <MediaHistory nodeId={id} history={nodeData.widgetValues?._history || []} historyIndex={nodeData.widgetValues?._historyIndex ?? -1}
        fallbackUrl={previewUrl} emptyIcon="🎨" genTime={nodeData.widgetValues?._genTime} />

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button className={`localgen-generate-btn ${processing ? "generating" : ""}data-fs-run-id={id} `} onClick={handleGenerate} disabled={processing}>
          {processing ? "Generating..." : "🎨 Generate"}
        </button>
      </div>

      <div className="img2img-outputs">
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

export default memo(Img2ImgNode);
