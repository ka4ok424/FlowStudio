import { memo, useCallback, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt, getImageUrl, uploadImage, getComfyUrl } from "../api/comfyApi";
import { addGenerationToLibrary } from "../store/mediaStore";
import MediaHistory from "./MediaHistory";
import { addToHistory } from "../utils/historyLimit";
import { log } from "../store/logStore";

function KontextNode({ id, data, selected }: NodeProps) {
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
    log("Kontext started", { nodeId: id, nodeType: "fs:kontext", nodeLabel: "Kontext" });

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const steps = freshWv.steps || 24;
    const cfg = freshWv.cfg ?? 3.5;
    const denoise = freshWv.denoise ?? 0.85;
    const seed = freshWv.seed ? parseInt(freshWv.seed) : Math.floor(Math.random() * 2147483647);
    const sampler = freshWv.sampler || "euler";
    const scheduler = freshWv.scheduler || "simple";

    // Get prompt
    let promptText = "";
    const promptEdge = edgesAll.find((e) => e.target === id && e.targetHandle === "prompt");
    if (promptEdge) {
      const promptNode = nodesAll.find((n) => n.id === promptEdge.source);
      if (promptNode) promptText = (promptNode.data as any).widgetValues?.text || "";
    }
    if (!promptText) { setError("Connect a Prompt node"); setProcessing(false); return; }

    // Get source image
    const imgEdge = edgesAll.find((e) => e.target === id && e.targetHandle === "input");
    if (!imgEdge) { setError("Connect a source image"); setProcessing(false); return; }
    const srcNode = nodesAll.find((n) => n.id === imgEdge.source);
    if (!srcNode) { setError("Source not found"); setProcessing(false); return; }
    const sd = srcNode.data as any;
    const srcUrl = sd.widgetValues?._previewUrl || sd.widgetValues?._preview || sd.widgetValues?.portraitUrl;
    if (!srcUrl) { setError("No image in source. Generate first."); setProcessing(false); return; }

    try {
      // Upload source image
      let imgName: string;
      if (srcUrl.startsWith("data:")) {
        imgName = await uploadImage(srcUrl, `fs_ktx_${imgEdge.source}.png`);
      } else {
        const resp = await fetch(srcUrl);
        const blob = await resp.blob();
        const dataUrl = await new Promise<string>((r) => { const rd = new FileReader(); rd.onloadend = () => r(rd.result as string); rd.readAsDataURL(blob); });
        imgName = await uploadImage(dataUrl, `fs_ktx_${imgEdge.source}.png`);
      }

      // Get source image dimensions
      const imgDims = await new Promise<{w:number,h:number}>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: Math.max(768, Math.round(img.width / 64) * 64) || 1024, h: Math.max(768, Math.round(img.height / 64) * 64) || 1024 });
        img.onerror = () => resolve({ w: 1024, h: 1024 });
        img.src = srcUrl;
      });

      // Build Kontext workflow: LoadImage → Scale → VAEEncode → ReferenceLatent → KSampler
      const workflow: Record<string, any> = {
        "1": { class_type: "UNETLoader", inputs: { unet_name: "flux1-kontext-dev.safetensors", weight_dtype: "default" } },
        "2": { class_type: "DualCLIPLoader", inputs: { clip_name1: "clip_l.safetensors", clip_name2: "t5xxl_fp8_e4m3fn.safetensors", type: "flux" } },
        "3": { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } },
        "4": { class_type: "CLIPTextEncode", inputs: { text: promptText, clip: ["2", 0] } },
        "5": { class_type: "LoadImage", inputs: { image: imgName } },
        "6": { class_type: "FluxKontextImageScale", inputs: { image: ["5", 0] } },
        "7": { class_type: "VAEEncode", inputs: { pixels: ["6", 0], vae: ["3", 0] } },
        "8": { class_type: "ReferenceLatent", inputs: { conditioning: ["4", 0], latent: ["7", 0] } },
        "9": { class_type: "EmptySD3LatentImage", inputs: { width: imgDims.w, height: imgDims.h, batch_size: 1 } },
        "10": {
          class_type: "KSampler",
          inputs: {
            model: ["1", 0], positive: ["8", 0], negative: ["8", 0],
            latent_image: ["9", 0], seed, steps, cfg, sampler_name: sampler, scheduler, denoise: 1.0,
          },
        },
        "11": { class_type: "VAEDecode", inputs: { samples: ["10", 0], vae: ["3", 0] } },
        "12": { class_type: "SaveImage", inputs: { images: ["11", 0], filename_prefix: `FS_KTX_${Date.now()}` } },
      };

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

                log("Kontext complete", { nodeId: id, nodeType: "fs:kontext", nodeLabel: "Kontext", status: "success", details: `${steps} steps` });
                addGenerationToLibrary(dataUrl, { prompt: promptText, model: "FLUX.1 Kontext", seed: String(seed), steps, cfg, nodeType: "fs:kontext", duration: Date.now() - startTime });
                setProcessing(false);
                return;
              }
            }
            const st = history[promptId].status;
            if (st?.completed || st?.status_str === "error") {
              const errMsg = history[promptId].status?.messages?.find((m: any) => m[0] === "execution_error");
              setError(errMsg ? errMsg[1]?.exception_message?.slice(0, 100) : "Generation failed");
              log("Kontext failed", { nodeId: id, nodeType: "fs:kontext", nodeLabel: "Kontext", status: "error" });
              setProcessing(false);
              return;
            }
          }
        } catch { /* keep polling */ }
      }
      setError("Timeout"); setProcessing(false);
    } catch (err: any) {
      setError(err.message);
      log("Kontext error", { nodeId: id, nodeType: "fs:kontext", nodeLabel: "Kontext", status: "error", details: err.message });
      setProcessing(false);
    }
  }, [id, edgesAll, nodesAll, updateWidgetValue]);

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
            <span className="kontext-status">{processing ? "EDITING..." : "FLUX.1"}</span>
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

      <MediaHistory
        nodeId={id}
        history={nodeData.widgetValues?._history || []}
        historyIndex={nodeData.widgetValues?._historyIndex ?? -1}
        fallbackUrl={previewUrl}
        emptyIcon="✏️"
        genTime={nodeData.widgetValues?._genTime}
      />

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button className={`localgen-generate-btn ${processing ? "generating" : ""}`} onClick={handleGenerate} disabled={processing}>
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
