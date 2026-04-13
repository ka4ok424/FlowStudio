import { memo, useCallback, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt, getImageUrl, uploadImage, getComfyUrl } from "../api/comfyApi";
import { addGenerationToLibrary } from "../store/mediaStore";
import MediaHistory from "./MediaHistory";
import { addToHistory } from "../utils/historyLimit";
import { log } from "../store/logStore";

function QualityNode({ id, data, selected }: NodeProps) {
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

  const handleQuality = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    setError(null);
    const startTime = Date.now();
    log("Quality started", { nodeId: id, nodeType: "fs:enhance", nodeLabel: "Quality" });

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const scale = freshWv.scale ?? 2;
    const steps = freshWv.steps || 20;
    const cfg = freshWv.cfg ?? 4.0;
    const restoration = freshWv.restoration ?? 0.5;
    const seed = freshWv.seed ? parseInt(freshWv.seed) : Math.floor(Math.random() * 2147483647);
    const prompt = freshWv.prompt || "high quality, detailed, sharp";
    const negPrompt = freshWv.negPrompt || "blurry, noise, artifacts, low quality";
    const colorFix = freshWv.colorFix || "AdaIn";

    const imgEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "input");
    if (!imgEdge) { setError("Connect an image"); setProcessing(false); return; }
    const srcNode = nodesAll.find((n) => n.id === imgEdge.source);
    if (!srcNode) { setError("Source not found"); setProcessing(false); return; }
    const sd = srcNode.data as any;
    const srcUrl = sd.widgetValues?._previewUrl || sd.widgetValues?._preview || sd.widgetValues?.portraitUrl;
    if (!srcUrl) { setError("No image in source"); setProcessing(false); return; }

    try {
      const fileName = `fs_enh_${imgEdge.source}.png`;
      let imgName: string;
      if (srcUrl.startsWith("data:")) {
        imgName = await uploadImage(srcUrl, fileName);
      } else {
        const resp = await fetch(srcUrl);
        const blob = await resp.blob();
        const dataUrl = await new Promise<string>((r) => { const rd = new FileReader(); rd.onloadend = () => r(rd.result as string); rd.readAsDataURL(blob); });
        imgName = await uploadImage(dataUrl, fileName);
      }

      const workflow: Record<string, any> = {
        // 1. Load SDXL checkpoint
        "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sd_xl_base_1.0.safetensors" } },
        // 2. Load SUPIR model
        "2": { class_type: "SUPIR_model_loader_v2", inputs: { model: ["1", 0], clip: ["1", 1], vae: ["1", 2], supir_model: "SUPIR-v0Q_fp16.safetensors", fp8_unet: false, diffusion_dtype: "auto" } },
        // 3. Load + upscale image
        "3": { class_type: "LoadImage", inputs: { image: imgName } },
        "4": { class_type: "ImageScaleBy", inputs: { image: ["3", 0], upscale_method: "lanczos", scale_by: scale } },
        // 5. First stage (VAE encode)
        "5": { class_type: "SUPIR_first_stage", inputs: { SUPIR_VAE: ["2", 1], image: ["4", 0], use_tiled_vae: true, encoder_tile_size: 512, decoder_tile_size: 64, encoder_dtype: "auto" } },
        // 6. Conditioner
        "6": { class_type: "SUPIR_conditioner", inputs: { SUPIR_model: ["2", 0], latents: ["5", 2], positive_prompt: prompt, negative_prompt: negPrompt } },
        // 7. Sample
        "7": { class_type: "SUPIR_sample", inputs: { SUPIR_model: ["2", 0], latents: ["5", 2], positive: ["6", 0], negative: ["6", 1], seed, steps, cfg_scale_start: cfg, cfg_scale_end: cfg, EDM_s_churn: 5, s_noise: 1.003, DPMPP_eta: 1.0, control_scale_start: restoration, control_scale_end: restoration, restore_cfg: -1.0, keep_model_loaded: true, sampler: "RestoreDPMPP2MSampler" } },
        // 8. Decode
        "8": { class_type: "SUPIR_decode", inputs: { SUPIR_VAE: ["5", 0], latents: ["7", 0], use_tiled_vae: true, decoder_tile_size: 64 } },
        // 9. Color fix + save
        "9": { class_type: "SaveImage", inputs: { images: ["8", 0], filename_prefix: `FS_ENH_${Date.now()}` } },
      };

      const result = await queuePrompt(workflow);
      const promptId = result.prompt_id;

      for (let attempt = 0; attempt < 300; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
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
                log("Quality complete", { nodeId: id, nodeType: "fs:enhance", nodeLabel: "Quality", status: "success", details: `${scale}x ${steps}steps` });
                addGenerationToLibrary(dataUrl, { prompt, model: "SUPIR", seed: String(seed), steps, cfg, nodeType: "fs:enhance", duration: Date.now() - startTime });
                setProcessing(false);
                return;
              }
            }
            const st = history[promptId].status;
            if (st?.completed || st?.status_str === "error") {
              const errMsg = history[promptId].status?.messages?.find((m: any) => m[0] === "execution_error");
              setError(errMsg ? errMsg[1]?.exception_message?.slice(0, 120) : "Quality failed");
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
        <button className={`localgen-generate-btn ${processing ? "generating" : ""}`} onClick={handleQuality} disabled={processing}>
          {processing ? "Enhancing..." : "✨ Quality"}
        </button>
      </div>

      <div className="quality-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-output-label">Qualityd</span>
          <Handle type="source" position={Position.Right} id="output_0" className={`slot-handle ${outputHL}`} style={{ color: "#64b5f6" }} />
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="type-badge" style={{ color, borderColor: color + "66", backgroundColor: color + "12" }}>{children}</span>;
}

export default memo(QualityNode);
