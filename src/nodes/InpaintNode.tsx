import { memo, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt, getImageUrl, uploadImage, getComfyUrl } from "../api/comfyApi";
import { addGenerationToLibrary } from "../store/mediaStore";
import MediaHistory from "./MediaHistory";
import MaskCanvas from "../components/MaskCanvas";
import { addToHistory } from "../utils/historyLimit";
import { log } from "../store/logStore";

const INPAINT_MODELS = [
  { value: "flux1-fill", label: "FLUX.1 Fill", desc: "Best quality, specialized inpaint" },
  { value: "klein-9b", label: "Klein 9B", desc: "Fast, good quality" },
  { value: "klein-4b", label: "Klein 4B", desc: "Fastest, lightweight" },
  { value: "sdxl-inpaint", label: "SDXL Inpainting", desc: "Good quality, dedicated checkpoint" },
  { value: "sd15-inpaint", label: "SD 1.5 Inpainting", desc: "Fast, lower quality" },
];

function InpaintNode({ id, data, selected }: NodeProps) {
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

  const getSourceImage = (): string | null => {
    const edge = edgesAll.find((e) => e.target === id && e.targetHandle === "input");
    if (!edge) return null;
    const src = nodesAll.find((n) => n.id === edge.source);
    if (!src) return null;
    const sd = src.data as any;
    return sd.widgetValues?._previewUrl || sd.widgetValues?._preview || sd.widgetValues?.portraitUrl || null;
  };

  const handleGenerate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    setError(null);
    const startTime = Date.now();
    log("Inpaint started", { nodeId: id, nodeType: "fs:inpaint", nodeLabel: "Inpaint" });

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const modelType = freshWv.modelType || "flux1-fill";
    const steps = freshWv.steps || 8;
    const cfg = freshWv.cfg ?? 1.0;
    const denoise = freshWv.denoise ?? 0.85;
    const seed = freshWv.seed ? parseInt(freshWv.seed) : Math.floor(Math.random() * 2147483647);
    const samPrompt = freshWv.samPrompt || "";
    const currentMask = freshWv._maskUrl;

    // Get text prompt
    let promptText = "";
    const promptEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "prompt");
    if (promptEdge) {
      const promptNode = nodesAll.find((n) => n.id === promptEdge.source);
      if (promptNode) promptText = (promptNode.data as any).widgetValues?.text || "";
    }
    if (!promptText) { setError("Connect a Prompt node"); setProcessing(false); return; }

    // Get source image
    const imgEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "input");
    if (!imgEdge) { setError("Connect a source image"); setProcessing(false); return; }
    const srcNode = nodesAll.find((n) => n.id === imgEdge.source);
    const srcUrl = (srcNode?.data as any)?.widgetValues?._previewUrl || (srcNode?.data as any)?.widgetValues?._preview;
    if (!srcUrl) { setError("No image in source"); setProcessing(false); return; }

    // Get mask: drawn > connected > SAM auto
    let maskData = currentMask;
    if (!maskData) {
      const maskEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "mask");
      if (maskEdge) {
        const maskNode = nodesAll.find((n) => n.id === maskEdge.source);
        maskData = (maskNode?.data as any)?.widgetValues?._previewUrl;
      }
    }
    const useSAM = !maskData && samPrompt;
    if (!maskData && !useSAM) { setError("Draw a mask, connect one, or set SAM prompt"); setProcessing(false); return; }

    try {
      // Upload image
      const imgFileName = `fs_inp_${imgEdge.source}.png`;
      let imgName: string;
      if (srcUrl.startsWith("data:")) {
        imgName = await uploadImage(srcUrl, imgFileName);
      } else {
        const resp = await fetch(srcUrl);
        const blob = await resp.blob();
        const dUrl = await new Promise<string>((r) => { const rd = new FileReader(); rd.onloadend = () => r(rd.result as string); rd.readAsDataURL(blob); });
        imgName = await uploadImage(dUrl, imgFileName);
      }

      // Upload mask (if not SAM)
      let maskName = "";
      if (maskData) {
        maskName = await uploadImage(maskData, `fs_inp_mask_${id}.png`);
      }

      // Build workflow based on model
      let workflow: Record<string, any> = {};
      let n = 1;

      if (useSAM) {
        // SAM auto-mask: image + text → mask
        const samImgId = String(n++);
        workflow[samImgId] = { class_type: "LoadImage", inputs: { image: imgName } };
        const samId = String(n++);
        workflow[samId] = { class_type: "SAM2Segment", inputs: { image: [samImgId, 0], prompt: samPrompt, sam2_model: "sam2_hiera_small", dino_model: "GroundingDINO_SwinB", device: "cuda" } };
        // SAM outputs: [0]=image, [1]=mask, [2]=overlay
        // Continue with mask from SAM
        const samMaskRef: [string, number] = [samId, 1];
        workflow = { ...workflow, ...buildInpaintWorkflow(modelType, imgName, null, samMaskRef, promptText, seed, steps, cfg, denoise, n) };
      } else {
        workflow = buildInpaintWorkflow(modelType, imgName, maskName, null, promptText, seed, steps, cfg, denoise, n);
      }

      const result = await queuePrompt(workflow);
      const promptId = result.prompt_id;

      for (let attempt = 0; attempt < 300; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        try {
          const histRes = await fetch(`${getComfyUrl()}/api/history/${promptId}`);
          if (!histRes.ok) continue;
          const history = await histRes.json();
          if (history[promptId]) {
            const outputs = history[promptId].outputs;
            for (const nId of Object.keys(outputs || {})) {
              const images = outputs[nId]?.images;
              if (images && images.length > 0) {
                const img = images[0];
                const apiUrl = getImageUrl(img.filename, img.subfolder, img.type);
                const resp = await fetch(apiUrl);
                const blob = await resp.blob();
                const dataUrl = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result as string); reader.readAsDataURL(blob); });

                updateWidgetValue(id, "_genTime", Date.now() - startTime);
                updateWidgetValue(id, "_previewUrl", dataUrl);
                const prevHist: string[] = (useWorkflowStore.getState().nodes.find(nd => nd.id === id)?.data as any)?.widgetValues?._history || [];
                const { history: newHist, index: newIdx } = await addToHistory(id, prevHist, dataUrl);
                updateWidgetValue(id, "_history", newHist);
                updateWidgetValue(id, "_historyIndex", newIdx);
                log("Inpaint complete", { nodeId: id, nodeType: "fs:inpaint", nodeLabel: "Inpaint", status: "success", details: modelType });
                addGenerationToLibrary(dataUrl, { prompt: promptText, model: modelType, seed: String(seed), steps, cfg, nodeType: "fs:inpaint", duration: Date.now() - startTime });
                setProcessing(false);
                return;
              }
            }
            const st = history[promptId].status;
            if (st?.completed || st?.status_str === "error") {
              const errMsg = history[promptId].status?.messages?.find((m: any) => m[0] === "execution_error");
              setError(errMsg ? errMsg[1]?.exception_message?.slice(0, 120) : "Inpaint failed");
              setProcessing(false);
              return;
            }
          }
        } catch { /* keep polling */ }
      }
      setError("Timeout"); setProcessing(false);
    } catch (err: any) {
      setError(err.message); setProcessing(false);
    }
  }, [id, edgesAll, nodesAll, updateWidgetValue]);

  const imgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const promptHL = connectingDir === "source" && (connectingType === "TEXT" || connectingType === "*") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(imgHL || promptHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  const sourceImg = getSourceImage();
  const currentModel = INPAINT_MODELS.find(m => m.value === (nodeData.widgetValues?.modelType || "flux1-fill"));

  return (
    <div className={`inpaint-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="inpaint-node-inner">
        <div className="inpaint-accent" />
        <div className="inpaint-header">
          <span className="inpaint-icon">🎭</span>
          <div className="inpaint-header-text">
            <span className="inpaint-title">Inpaint</span>
            <span className="inpaint-status">{processing ? "INPAINTING..." : currentModel?.label || "FLUX.1 Fill"}</span>
          </div>
        </div>
      </div>

      <div className="inpaint-inputs">
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
          <Handle type="target" position={Position.Left} id="mask" className={`slot-handle ${imgHL}`} style={{ color: "#888888" }} />
          <TypeBadge color="#888888">MASK</TypeBadge>
          <span className="nanob-input-label">Mask (optional)</span>
        </div>
      </div>

      <MediaHistory nodeId={id} history={nodeData.widgetValues?._history || []} historyIndex={nodeData.widgetValues?._historyIndex ?? -1} fallbackUrl={previewUrl} emptyIcon="🎭" genTime={nodeData.widgetValues?._genTime} />

      {maskUrl && (
        <div className="inpaint-mask-preview">
          <img src={maskUrl} alt="Mask" style={{ width: "100%", height: 40, objectFit: "cover", opacity: 0.6, borderRadius: 4 }} />
          <span style={{ position: "absolute", top: 2, left: 6, fontSize: 9, color: "#fff", opacity: 0.7 }}>mask</span>
        </div>
      )}

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <div style={{ display: "flex", gap: 4 }}>
          <button className={`localgen-generate-btn ${processing ? "generating" : ""}`} onClick={handleGenerate} disabled={processing} style={{ flex: 1 }}>
            {processing ? "Inpainting..." : "🎭 Inpaint"}
          </button>
          <button className="localgen-generate-btn" disabled={!sourceImg} onClick={(ev) => { ev.stopPropagation(); if (sourceImg) setShowMaskEditor(true); }} style={{ padding: "0 10px" }} title="Draw mask">
            🖌️
          </button>
        </div>
      </div>

      <div className="inpaint-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-output-label">Output</span>
          <Handle type="source" position={Position.Right} id="output_0" className={`slot-handle ${outputHL}`} style={{ color: "#64b5f6" }} />
        </div>
      </div>

      {showMaskEditor && sourceImg && createPortal(
        <MaskCanvas
          imageUrl={sourceImg}
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

// Build inpaint workflow based on model type
function buildInpaintWorkflow(
  modelType: string, imgName: string, maskName: string | null,
  samMaskRef: [string, number] | null, promptText: string,
  seed: number, steps: number, cfg: number, denoise: number, startN: number,
  preserveOriginal: boolean = true
): Record<string, any> {
  const wf: Record<string, any> = {};
  let n = startN;

  const imgLoadId = maskName ? String(n++) : null;
  if (imgLoadId && maskName) {
    wf[imgLoadId] = { class_type: "LoadImage", inputs: { image: imgName } };
  }
  const maskLoadId = maskName ? String(n++) : null;
  if (maskLoadId && maskName) {
    wf[maskLoadId] = { class_type: "LoadImageMask", inputs: { image: maskName, channel: "red" } };
  }
  // If SAM, image already loaded in caller, use ref "1" for image
  const imgRef: [string, number] = imgLoadId ? [imgLoadId, 0] : ["1", 0];
  const maskRef: [string, number] = samMaskRef || (maskLoadId ? [maskLoadId, 0] : ["1", 0]);

  if (modelType === "flux1-fill") {
    // FLUX.1 Fill: InpaintModelConditioning (original approach, best quality)
    const unetId = String(n++);
    wf[unetId] = { class_type: "UNETLoader", inputs: { unet_name: "flux1-fill-dev.safetensors", weight_dtype: "default" } };
    const clipId = String(n++);
    wf[clipId] = { class_type: "DualCLIPLoader", inputs: { clip_name1: "clip_l.safetensors", clip_name2: "t5xxl_fp8_e4m3fn.safetensors", type: "flux" } };
    const vaeId = String(n++);
    wf[vaeId] = { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } };
    const posId = String(n++);
    wf[posId] = { class_type: "CLIPTextEncode", inputs: { text: promptText, clip: [clipId, 0] } };
    const negId = String(n++);
    wf[negId] = { class_type: "CLIPTextEncode", inputs: { text: "", clip: [clipId, 0] } };
    const condId = String(n++);
    wf[condId] = { class_type: "InpaintModelConditioning", inputs: { positive: [posId, 0], negative: [negId, 0], vae: [vaeId, 0], pixels: imgRef, mask: maskRef, noise_mask: true } };
    const samplerId = String(n++);
    wf[samplerId] = { class_type: "KSampler", inputs: { model: [unetId, 0], positive: [condId, 0], negative: [condId, 1], latent_image: [condId, 2], seed, steps: Math.max(steps, 20), cfg, sampler_name: "euler", scheduler: "simple", denoise: 1.0 } };
    const decodeId = String(n++);
    wf[decodeId] = { class_type: "VAEDecode", inputs: { samples: [samplerId, 0], vae: [vaeId, 0] } };
    // Preserve Original: composite inpaint result back onto original using mask
    if (preserveOriginal && (maskName || samMaskRef)) {
      const origImgId = String(n++);
      wf[origImgId] = { class_type: "LoadImage", inputs: { image: imgName } };
      const compositeId = String(n++);
      wf[compositeId] = { class_type: "ImageCompositeMasked", inputs: { destination: [origImgId, 0], source: [decodeId, 0], x: 0, y: 0, resize_source: true, mask: maskRef } };
      const saveId = String(n++);
      wf[saveId] = { class_type: "SaveImage", inputs: { images: [compositeId, 0], filename_prefix: `FS_INP_${Date.now()}` } };
    } else {
      const saveId = String(n++);
      wf[saveId] = { class_type: "SaveImage", inputs: { images: [decodeId, 0], filename_prefix: `FS_INP_${Date.now()}` } };
    }

  } else if (modelType === "klein-9b") {
    // Klein 9B: SetLatentNoiseMask approach
    const unetId = String(n++);
    wf[unetId] = { class_type: "UNETLoader", inputs: { unet_name: "flux-2-klein-9b.safetensors", weight_dtype: "default" } };
    const clipId = String(n++);
    wf[clipId] = { class_type: "CLIPLoader", inputs: { clip_name: "qwen3_8b_klein9b.safetensors", type: "flux2", device: "default" } };
    const vaeId = String(n++);
    wf[vaeId] = { class_type: "VAELoader", inputs: { vae_name: "flux2-vae.safetensors" } };
    const encId = String(n++);
    wf[encId] = { class_type: "VAEEncode", inputs: { pixels: imgRef, vae: [vaeId, 0] } };
    const maskSetId = String(n++);
    wf[maskSetId] = { class_type: "SetLatentNoiseMask", inputs: { samples: [encId, 0], mask: maskRef } };
    const textId = String(n++);
    wf[textId] = { class_type: "CLIPTextEncode", inputs: { text: promptText, clip: [clipId, 0] } };
    const samplerId = String(n++);
    wf[samplerId] = { class_type: "KSampler", inputs: { model: [unetId, 0], positive: [textId, 0], negative: [textId, 0], latent_image: [maskSetId, 0], seed, steps, cfg, sampler_name: "euler", scheduler: "simple", denoise } };
    const decodeId = String(n++);
    wf[decodeId] = { class_type: "VAEDecode", inputs: { samples: [samplerId, 0], vae: [vaeId, 0] } };
    // Preserve Original: composite inpaint result back onto original using mask
    if (preserveOriginal && (maskName || samMaskRef)) {
      const origImgId = String(n++);
      wf[origImgId] = { class_type: "LoadImage", inputs: { image: imgName } };
      const compositeId = String(n++);
      wf[compositeId] = { class_type: "ImageCompositeMasked", inputs: { destination: [origImgId, 0], source: [decodeId, 0], x: 0, y: 0, resize_source: true, mask: maskRef } };
      const saveId = String(n++);
      wf[saveId] = { class_type: "SaveImage", inputs: { images: [compositeId, 0], filename_prefix: `FS_INP_${Date.now()}` } };
    } else {
      const saveId = String(n++);
      wf[saveId] = { class_type: "SaveImage", inputs: { images: [decodeId, 0], filename_prefix: `FS_INP_${Date.now()}` } };
    }

  } else if (modelType === "klein-4b") {
    // Klein 4B: SetLatentNoiseMask + DDIM Trailing + Shift 3.0 (Draw Things settings)
    const unetId = String(n++);
    wf[unetId] = { class_type: "UNETLoader", inputs: { unet_name: "flux-2-klein-4b.safetensors", weight_dtype: "default" } };
    const shiftId = String(n++);
    wf[shiftId] = { class_type: "ModelSamplingFlux", inputs: { model: [unetId, 0], max_shift: 3.0, base_shift: 0.5, width: 1024, height: 1024 } };
    const clipId = String(n++);
    wf[clipId] = { class_type: "CLIPLoader", inputs: { clip_name: "qwen_3_4b_fp4_flux2.safetensors", type: "flux2", device: "default" } };
    const vaeId = String(n++);
    wf[vaeId] = { class_type: "VAELoader", inputs: { vae_name: "flux2-vae.safetensors" } };
    const encId = String(n++);
    wf[encId] = { class_type: "VAEEncode", inputs: { pixels: imgRef, vae: [vaeId, 0] } };
    const maskSetId = String(n++);
    wf[maskSetId] = { class_type: "SetLatentNoiseMask", inputs: { samples: [encId, 0], mask: maskRef } };
    const textId = String(n++);
    wf[textId] = { class_type: "CLIPTextEncode", inputs: { text: promptText, clip: [clipId, 0] } };
    const samplerId = String(n++);
    wf[samplerId] = { class_type: "KSampler", inputs: { model: [shiftId, 0], positive: [textId, 0], negative: [textId, 0], latent_image: [maskSetId, 0], seed, steps, cfg, sampler_name: "ddim", scheduler: "sgm_uniform", denoise } };
    const decodeId = String(n++);
    wf[decodeId] = { class_type: "VAEDecode", inputs: { samples: [samplerId, 0], vae: [vaeId, 0] } };
    // Preserve Original: composite inpaint result back onto original using mask
    if (preserveOriginal && (maskName || samMaskRef)) {
      const origImgId = String(n++);
      wf[origImgId] = { class_type: "LoadImage", inputs: { image: imgName } };
      const compositeId = String(n++);
      wf[compositeId] = { class_type: "ImageCompositeMasked", inputs: { destination: [origImgId, 0], source: [decodeId, 0], x: 0, y: 0, resize_source: true, mask: maskRef } };
      const saveId = String(n++);
      wf[saveId] = { class_type: "SaveImage", inputs: { images: [compositeId, 0], filename_prefix: `FS_INP_${Date.now()}` } };
    } else {
      const saveId = String(n++);
      wf[saveId] = { class_type: "SaveImage", inputs: { images: [decodeId, 0], filename_prefix: `FS_INP_${Date.now()}` } };
    }

  } else {
    // SD 1.5 / SDXL Inpainting: CheckpointLoaderSimple + VAEEncodeForInpaint
    const ckpt = modelType === "sdxl-inpaint" ? "sdxl-inpainting.safetensors" : "sd-v1-5-inpainting.ckpt";
    const ckptId = String(n++);
    wf[ckptId] = { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: ckpt } };
    const encId = String(n++);
    wf[encId] = { class_type: "VAEEncodeForInpaint", inputs: { pixels: imgRef, vae: [ckptId, 2], mask: maskRef, grow_mask_by: 6 } };
    const posId = String(n++);
    wf[posId] = { class_type: "CLIPTextEncode", inputs: { text: promptText, clip: [ckptId, 1] } };
    const negId = String(n++);
    wf[negId] = { class_type: "CLIPTextEncode", inputs: { text: "", clip: [ckptId, 1] } };
    const samplerId = String(n++);
    wf[samplerId] = { class_type: "KSampler", inputs: { model: [ckptId, 0], positive: [posId, 0], negative: [negId, 0], latent_image: [encId, 0], seed, steps: Math.max(steps, 15), cfg: Math.max(cfg, 5), sampler_name: "euler", scheduler: "normal", denoise } };
    const decodeId = String(n++);
    wf[decodeId] = { class_type: "VAEDecode", inputs: { samples: [samplerId, 0], vae: [ckptId, 2] } };
    // Preserve Original: composite inpaint result back onto original using mask
    if (preserveOriginal && (maskName || samMaskRef)) {
      const origImgId = String(n++);
      wf[origImgId] = { class_type: "LoadImage", inputs: { image: imgName } };
      const compositeId = String(n++);
      wf[compositeId] = { class_type: "ImageCompositeMasked", inputs: { destination: [origImgId, 0], source: [decodeId, 0], x: 0, y: 0, resize_source: true, mask: maskRef } };
      const saveId = String(n++);
      wf[saveId] = { class_type: "SaveImage", inputs: { images: [compositeId, 0], filename_prefix: `FS_INP_${Date.now()}` } };
    } else {
      const saveId = String(n++);
      wf[saveId] = { class_type: "SaveImage", inputs: { images: [decodeId, 0], filename_prefix: `FS_INP_${Date.now()}` } };
    }
  }

  return wf;
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="type-badge" style={{ color, borderColor: color + "66", backgroundColor: color + "12" }}>{children}</span>;
}

export default memo(InpaintNode);
