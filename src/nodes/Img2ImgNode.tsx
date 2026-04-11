import { memo, useCallback, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt, getImageUrl, uploadImage, getComfyUrl } from "../api/comfyApi";
import { addGenerationToLibrary } from "../store/mediaStore";
import MediaHistory from "./MediaHistory";
import { addToHistory } from "../utils/historyLimit";
import { log } from "../store/logStore";

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
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    setError(null);
    const startTime = Date.now();
    log("Img2Img started", { nodeId: id, nodeType: "fs:img2img", nodeLabel: "Img2Img" });

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const steps = freshWv.steps || 28;
    const cfg = freshWv.cfg ?? 3.5;
    const denoise = freshWv.denoise ?? 0.75;
    const width = freshWv.width || 1024;
    const height = freshWv.height || 1024;
    const seed = freshWv.seed ? parseInt(freshWv.seed) : Math.floor(Math.random() * 2147483647);

    // Get prompt from connected Prompt node
    let promptText = "";
    const promptEdge = edgesAll.find((e) => e.target === id && e.targetHandle === "prompt");
    if (promptEdge) {
      const promptNode = nodesAll.find((n) => n.id === promptEdge.source);
      if (promptNode) promptText = (promptNode.data as any).widgetValues?.text || "";
    }
    if (!promptText) { setError("Connect a Prompt node"); setProcessing(false); return; }

    // Collect reference images from ref_0..ref_N inputs
    const curRefCount = freshWv._refCount || DEFAULT_REFS;
    const refUrls: string[] = [];
    for (let i = 0; i < curRefCount; i++) {
      const edge = edgesAll.find((e) => e.target === id && e.targetHandle === `ref_${i}`);
      if (!edge) continue;
      const srcNode = nodesAll.find((n) => n.id === edge.source);
      if (!srcNode) continue;
      const sd = srcNode.data as any;
      const url = sd.widgetValues?._previewUrl || sd.widgetValues?._preview || sd.widgetValues?.portraitUrl;
      if (url) refUrls.push(url);
    }
    if (refUrls.length === 0) { setError("Connect at least 1 reference image"); setProcessing(false); return; }

    try {
      // Upload all reference images to ComfyUI
      const imgNames: string[] = [];
      for (let i = 0; i < refUrls.length; i++) {
        const url = refUrls[i];
        let imgName: string;
        if (url.startsWith("data:")) {
          imgName = await uploadImage(url, `fs_ref_${Date.now()}_${i}.png`);
        } else {
          const resp = await fetch(url);
          const blob = await resp.blob();
          const dataUrl = await new Promise<string>((r) => { const rd = new FileReader(); rd.onloadend = () => r(rd.result as string); rd.readAsDataURL(blob); });
          imgName = await uploadImage(dataUrl, `fs_ref_${Date.now()}_${i}.png`);
        }
        imgNames.push(imgName);
      }

      // Build workflow: FLUX.2 Dev with ReferenceLatent chain
      const workflow: Record<string, any> = {};
      let nodeIdx = 1;

      // 1. UNETLoader — flux2-dev
      const unetId = String(nodeIdx++);
      workflow[unetId] = { class_type: "UNETLoader", inputs: { unet_name: "flux2_dev_fp8mixed.safetensors", weight_dtype: "default" } };

      // 2. CLIPLoader — Mistral
      const clipId = String(nodeIdx++);
      workflow[clipId] = { class_type: "CLIPLoader", inputs: { clip_name: "mistral_3_small_flux2_fp8.safetensors", type: "flux2", device: "default" } };

      // 3. VAELoader
      const vaeId = String(nodeIdx++);
      workflow[vaeId] = { class_type: "VAELoader", inputs: { vae_name: "flux2-vae.safetensors" } };

      // 4. CLIPTextEncode
      const encodeId = String(nodeIdx++);
      workflow[encodeId] = { class_type: "CLIPTextEncode", inputs: { text: promptText, clip: [clipId, 0] } };

      // 5-N. Load + VAEEncode + ReferenceLatent chain for each ref image
      let lastCondId = encodeId;
      let lastCondSlot = 0;
      for (let i = 0; i < imgNames.length; i++) {
        const loadId = String(nodeIdx++);
        workflow[loadId] = { class_type: "LoadImage", inputs: { image: imgNames[i] } };

        const scaleId = String(nodeIdx++);
        workflow[scaleId] = { class_type: "FluxKontextImageScale", inputs: { image: [loadId, 0] } };

        const vaeEncId = String(nodeIdx++);
        workflow[vaeEncId] = { class_type: "VAEEncode", inputs: { pixels: [scaleId, 0], vae: [vaeId, 0] } };

        const refLatentId = String(nodeIdx++);
        workflow[refLatentId] = { class_type: "ReferenceLatent", inputs: { conditioning: [lastCondId, lastCondSlot], latent: [vaeEncId, 0] } };

        lastCondId = refLatentId;
        lastCondSlot = 0;
      }

      // EmptyLatentImage for output
      const emptyLatentId = String(nodeIdx++);
      workflow[emptyLatentId] = { class_type: "EmptySD3LatentImage", inputs: { width, height, batch_size: 1 } };

      // KSampler
      const samplerId = String(nodeIdx++);
      workflow[samplerId] = {
        class_type: "KSampler",
        inputs: {
          model: [unetId, 0], positive: [lastCondId, lastCondSlot], negative: [lastCondId, lastCondSlot],
          latent_image: [emptyLatentId, 0], seed, steps, cfg, sampler_name: "euler", scheduler: "simple", denoise,
        },
      };

      // VAEDecode
      const decodeId = String(nodeIdx++);
      workflow[decodeId] = { class_type: "VAEDecode", inputs: { samples: [samplerId, 0], vae: [vaeId, 0] } };

      // SaveImage
      const saveId = String(nodeIdx++);
      workflow[saveId] = { class_type: "SaveImage", inputs: { images: [decodeId, 0], filename_prefix: `FS_I2I_${Date.now()}` } };

      const result = await queuePrompt(workflow);
      const promptId = result.prompt_id;

      // Poll for result
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise((r) => setTimeout(r, 1500));
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
                const prevHist: string[] = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues?._history || [];
                const { history: newHist, index: newIdx } = await addToHistory(id, prevHist, dataUrl);
                updateWidgetValue(id, "_history", newHist);
                updateWidgetValue(id, "_historyIndex", newIdx);

                log("Img2Img complete", { nodeId: id, nodeType: "fs:img2img", nodeLabel: "Img2Img", status: "success", details: `${refUrls.length} refs, ${steps} steps` });
                addGenerationToLibrary(dataUrl, { prompt: promptText, model: "FLUX.2 Dev", seed: String(seed), steps, cfg, width, height, nodeType: "fs:img2img", duration: Date.now() - startTime });
                setProcessing(false);
                return;
              }
            }
            const st = history[promptId].status;
            if (st?.completed || st?.status_str === "error") {
              const errMsg = history[promptId].status?.messages?.find((m: any) => m[0] === "execution_error");
              setError(errMsg ? errMsg[1]?.exception_message?.slice(0, 100) : "Generation failed");
              log("Img2Img failed", { nodeId: id, nodeType: "fs:img2img", nodeLabel: "Img2Img", status: "error" });
              setProcessing(false);
              return;
            }
          }
        } catch { /* keep polling */ }
      }
      setError("Timeout"); setProcessing(false);
    } catch (err: any) {
      setError(err.message);
      log("Img2Img error", { nodeId: id, nodeType: "fs:img2img", nodeLabel: "Img2Img", status: "error", details: err.message });
      setProcessing(false);
    }
  }, [id, edgesAll, nodesAll, updateWidgetValue]);

  // Highlighting
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
            <span className="img2img-status">{processing ? "PROCESSING..." : "FLUX.2 Dev"}</span>
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
            <button
              className="img2img-add-ref-btn"
              onClick={(e) => { e.stopPropagation(); updateWidgetValue(id, "_refCount", refCount + 1); }}
            >+ Add Ref</button>
          </div>
        )}
      </div>

      <MediaHistory
        nodeId={id}
        history={nodeData.widgetValues?._history || []}
        historyIndex={nodeData.widgetValues?._historyIndex ?? -1}
        fallbackUrl={previewUrl}
        emptyIcon="🎨"
        genTime={nodeData.widgetValues?._genTime}
      />

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button className={`localgen-generate-btn ${processing ? "generating" : ""}`} onClick={handleGenerate} disabled={processing}>
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
