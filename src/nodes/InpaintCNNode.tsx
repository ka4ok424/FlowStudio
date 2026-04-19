import { memo, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt } from "../api/comfyApi";
import { log } from "../store/logStore";
import { uploadSourceImage, pollForResult, fetchAsDataUrl, saveGenerationResult, getConnectedImageUrl, getConnectedPrompt } from "../hooks/useNodeHelpers";
import { buildInpaintControlNetWorkflow } from "../workflows/inpaintControlNet";
import MediaHistory from "./MediaHistory";
import MaskCanvas from "../components/MaskCanvas";

function InpaintCNNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const previewUrl = nodeData.widgetValues?._previewUrl || null;
  const maskUrl = nodeData.widgetValues?._maskUrl || null;
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMaskEditor, setShowMaskEditor] = useState(false);
  const [batchInfo, setBatchInfo] = useState<{ done: number; total: number } | null>(null);
  const count: number = Math.max(1, Math.min(20, nodeData.widgetValues?.count ?? 1));

  const getSourceImage = (): string | null => getConnectedImageUrl(id, "input", nodesAll as any[], edgesAll as any[]);

  const handleGenerate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    setError(null);

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const steps = freshWv.steps || 20;
    const guidance = freshWv.guidance ?? 30;
    const denoise = freshWv.denoise ?? 0.85;
    const controlType = freshWv.controlType || "canny";
    const cnStrength = freshWv.cnStrength ?? 0.5;
    const cnStartPercent = freshWv.cnStartPercent ?? 0.0;
    const cnEndPercent = freshWv.cnEndPercent ?? 0.8;
    const cannyLow = freshWv.cannyLow ?? 0.4;
    const cannyHigh = freshWv.cannyHigh ?? 0.8;
    const samPrompt = freshWv.samPrompt || "";
    const currentMask = freshWv._maskUrl;
    const nRuns: number = Math.max(1, Math.min(20, freshWv.count ?? 1));

    const promptText = getConnectedPrompt(id, nodesAll as any[], edgesAll as any[]);
    if (!promptText) { setError("Connect a Prompt node"); setProcessing(false); return; }
    const imgEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "input");
    if (!imgEdge) { setError("Connect a source image"); setProcessing(false); return; }
    const srcUrl = getSourceImage();
    if (!srcUrl) { setError("No image in source"); setProcessing(false); return; }

    let maskData = currentMask;
    if (!maskData) {
      const maskEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "mask");
      if (maskEdge) maskData = getConnectedImageUrl(id, "mask", nodesAll as any[], edgesAll as any[]);
    }
    const useSAM = !maskData && samPrompt;
    if (!maskData && !useSAM) { setError("Draw a mask, connect one, or set SAM prompt"); setProcessing(false); return; }

    log(`Inpaint+CN started${nRuns > 1 ? ` ×${nRuns}` : ""}`, { nodeId: id, nodeType: "fs:inpaintCN", nodeLabel: "Inpaint+CN" });

    try {
      const imgName = await uploadSourceImage(srcUrl, `fs_ipcn_${imgEdge.source}_${Date.now()}.png`);
      let maskName: string | null = null;
      if (maskData) maskName = await uploadSourceImage(maskData, `fs_ipcn_mask_${id}_${Date.now()}.png`);

      for (let i = 0; i < nRuns; i++) {
        if (nRuns > 1) setBatchInfo({ done: i, total: nRuns });
        const startTime = Date.now();
        const seed = nRuns > 1
          ? Math.floor(Math.random() * 2147483647)
          : (freshWv.seed ? parseInt(freshWv.seed) : Math.floor(Math.random() * 2147483647));

        let workflow: Record<string, any>;
        if (useSAM) {
          workflow = {
            "1": { class_type: "LoadImage", inputs: { image: imgName } },
            "2": { class_type: "SAM2Segment", inputs: { image: ["1", 0], prompt: samPrompt, sam2_model: "sam2_hiera_small", dino_model: "GroundingDINO_SwinB", device: "cuda" } },
          };
          const mainWf = buildInpaintControlNetWorkflow({
            imgName, maskName: null, samMaskRef: ["2", 1],
            prompt: promptText, seed, steps, guidance, denoise,
            controlType, cnStrength, cnStartPercent, cnEndPercent, cannyLow, cannyHigh,
          });
          workflow = { ...workflow, ...mainWf };
        } else {
          workflow = buildInpaintControlNetWorkflow({
            imgName, maskName, samMaskRef: null,
            prompt: promptText, seed, steps, guidance, denoise,
            controlType, cnStrength, cnStartPercent, cnEndPercent, cannyLow, cannyHigh,
          });
        }

        const result = await queuePrompt(workflow);
        const pollResult = await pollForResult(result.prompt_id, { interval: 1500 });
        if (!pollResult || "error" in pollResult) {
          setError(pollResult ? pollResult.error : "No result");
          break;
        }
        const dataUrl = await fetchAsDataUrl(pollResult.apiUrl);
        await saveGenerationResult(id, dataUrl, Date.now() - startTime, {
          prompt: promptText, model: "FLUX.1 Fill + CN", seed: String(seed),
          steps, cfg: guidance, nodeType: "fs:inpaintCN",
        });
        log(`Inpaint+CN done${nRuns > 1 ? ` (${i + 1}/${nRuns})` : ""}`, {
          nodeId: id, nodeType: "fs:inpaintCN", status: "success", details: `seed ${seed}`,
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

  const sourceImg = getSourceImage();
  const controlType = nodeData.widgetValues?.controlType || "canny";

  return (
    <div className={`inpaintcn-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="inpaintcn-node-inner">
        <div className="inpaintcn-accent" />
        <div className="inpaintcn-header">
          <span className="inpaintcn-icon">🎯</span>
          <div className="inpaintcn-header-text">
            <span className="inpaintcn-title">Inpaint + ControlNet</span>
            <span className="inpaintcn-status">
              {processing
                ? (batchInfo ? `BATCH ${batchInfo.done + 1}/${batchInfo.total}` : "GENERATING...")
                : `FLUX.1 Dev + ${controlType}${count > 1 ? ` · ×${count}` : ""}`}
            </span>
          </div>
        </div>
      </div>

      <div className="inpaintcn-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="prompt" className={`slot-handle ${promptHL}`} style={{ color: "#f0c040" }} />
          <TypeBadge color="#f0c040">TXT</TypeBadge>
          <span className="nanob-input-label">What to paint</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="input" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Source Image</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="mask" className={`slot-handle ${imgHL}`} style={{ color: "#4dd0e1" }} />
          <TypeBadge color="#888888">MASK</TypeBadge>
          <span className="nanob-input-label">Mask (optional)</span>
        </div>
      </div>

      <div className="inpaintcn-preview-wrap">
        <MediaHistory nodeId={id} history={nodeData.widgetValues?._history || []} historyIndex={nodeData.widgetValues?._historyIndex ?? -1} fallbackUrl={previewUrl} emptyIcon="🎯" genTime={nodeData.widgetValues?._genTime} />
        {maskUrl && <img src={maskUrl} alt="Mask" className="inpaint-mask-overlay" />}
      </div>

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button className={`inpaintcn-generate-btn ${processing ? "generating" : ""}data-fs-run-id={id} `} onClick={handleGenerate} disabled={processing}>
          {processing ? "Generating..." : "🎯 Inpaint + ControlNet"}
        </button>
        <button className="inpaint-mask-btn" disabled={!sourceImg} onClick={(ev) => { ev.stopPropagation(); if (sourceImg) setShowMaskEditor(true); }} title="Draw mask">
          🖍️
        </button>
      </div>

      <div className="inpaintcn-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-output-label">Output</span>
          <Handle type="source" position={Position.Right} id="output_0" className={`slot-handle ${outputHL}`} style={{ color: "#64b5f6" }} />
        </div>
      </div>

      {showMaskEditor && sourceImg && createPortal(
        <MaskCanvas
          imageUrl={sourceImg}
          existingMask={maskUrl}
          onSave={(maskDataUrl) => {
            updateWidgetValue(id, "_maskUrl", maskDataUrl);
            setShowMaskEditor(false);
          }}
          onClose={() => setShowMaskEditor(false)}
        />,
        document.body
      )}
    </div>
  );
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="type-badge" style={{ color, borderColor: color + "66", backgroundColor: color + "12" }}>{children}</span>;
}

export default memo(InpaintCNNode);
