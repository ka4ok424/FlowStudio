import { memo, useCallback, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt, getImageUrl, uploadImage, getComfyUrl } from "../api/comfyApi";
import { addGenerationToLibrary } from "../store/mediaStore";
import MediaHistory from "./MediaHistory";
import { addToHistory } from "../utils/historyLimit";
import { log } from "../store/logStore";

const METHODS = ["ai_realesrgan", "ai_anime", "lanczos", "bicubic", "bilinear", "nearest-exact", "area"];
const SCALES = [1.5, 2, 3, 4];

function UpscaleNode({ id, data, selected }: NodeProps) {
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

  const handleUpscale = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Get input image
    const imgEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "input");
    if (!imgEdge) { setError("Connect an image source"); return; }
    const srcNode = nodesAll.find((n) => n.id === imgEdge.source);
    if (!srcNode) { setError("Source not found"); return; }
    const sd = srcNode.data as any;
    const srcUrl = sd.widgetValues?._previewUrl || sd.widgetValues?._preview || sd.widgetValues?.portraitUrl;
    if (!srcUrl) { setError("No image in source. Generate first."); return; }

    setProcessing(true);
    setError(null);
    const startTime = Date.now();
    log("Upscale started", { nodeId: id, nodeType: "fs:upscale", nodeLabel: "Upscale" });

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const scale = freshWv.scale || 2;
    const method = freshWv.method || "ai_ultrasharp";

    try {
      // Upload source image to ComfyUI
      let imgName: string;
      if (srcUrl.startsWith("data:")) {
        imgName = await uploadImage(srcUrl, `fs_up_${imgEdge.source}.png`);
      } else {
        const resp = await fetch(srcUrl);
        const blob = await resp.blob();
        const dataUrl = await new Promise<string>((r) => {
          const rd = new FileReader(); rd.onloadend = () => r(rd.result as string); rd.readAsDataURL(blob);
        });
        imgName = await uploadImage(dataUrl, `fs_up_${imgEdge.source}.png`);
      }

      // Build workflow: LoadImage → AI Upscale (RealESRGAN) → SaveImage
      const useAI = method.startsWith("ai_");
      let workflow: Record<string, any>;

      if (useAI) {
        const modelMap: Record<string, string> = {
          ai_ultrasharp: "4x-UltraSharp.pth",
          ai_realesrgan: "RealESRGAN_x4plus.pth",
          ai_realesrgan_x2: "RealESRGAN_x2plus.pth",
          ai_anime: "RealESRGAN_x4plus_anime_6B.pth",
        };
        const modelName = modelMap[method] || "4x-UltraSharp.pth";
        workflow = {
          "1": { class_type: "LoadImage", inputs: { image: imgName } },
          "2": { class_type: "UpscaleModelLoader", inputs: { model_name: modelName } },
          "3": { class_type: "ImageUpscaleWithModel", inputs: { upscale_model: ["2", 0], image: ["1", 0] } },
          "4": { class_type: "SaveImage", inputs: { images: ["3", 0], filename_prefix: `UP_${Date.now()}` } },
        };
      } else {
        workflow = {
          "1": { class_type: "LoadImage", inputs: { image: imgName } },
          "2": { class_type: "ImageScaleBy", inputs: { image: ["1", 0], upscale_method: method, scale_by: scale } },
          "3": { class_type: "SaveImage", inputs: { images: ["2", 0], filename_prefix: `UP_${Date.now()}` } },
        };
      }

      const result = await queuePrompt(workflow);
      const promptId = result.prompt_id;

      // Poll for result
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise((r) => setTimeout(r, 1000));
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

                // Convert to data URL
                const resp = await fetch(apiUrl);
                const blob = await resp.blob();
                const dataUrl = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.readAsDataURL(blob);
                });

                updateWidgetValue(id, "_genTime", Date.now() - startTime);
                updateWidgetValue(id, "_previewUrl", dataUrl);
                const prevHist: string[] = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues?._history || [];
                const { history: newHist, index: newIdx } = await addToHistory(id, prevHist, dataUrl);
                updateWidgetValue(id, "_history", newHist);
                updateWidgetValue(id, "_historyIndex", newIdx);

                log("Upscale complete", { nodeId: id, nodeType: "fs:upscale", nodeLabel: "Upscale", status: "success", details: `${scale}x ${method}` });

                addGenerationToLibrary(dataUrl, {
                  prompt: `Upscale ${scale}x ${method}`,
                  model: method.startsWith("ai_") ? method : "ImageScaleBy",
                  seed: "n/a",
                  nodeType: "fs:upscale",
                  duration: Date.now() - startTime,
                });

                setProcessing(false);
                return;
              }
            }
            const st = history[promptId].status;
            if (st?.completed || st?.status_str === "error") {
              setError("Upscale failed");
              log("Upscale failed", { nodeId: id, nodeType: "fs:upscale", nodeLabel: "Upscale", status: "error" });
              setProcessing(false);
              return;
            }
          }
        } catch { /* keep polling */ }
      }
      setError("Timeout");
      setProcessing(false);
    } catch (err: any) {
      setError(err.message);
      log("Upscale error", { nodeId: id, nodeType: "fs:upscale", nodeLabel: "Upscale", status: "error", details: err.message });
      setProcessing(false);
    }
  }, [id, edgesAll, nodesAll, updateWidgetValue]);

  // Highlighting
  const imgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(imgHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  return (
    <div
      className={`upscale-node ${selected ? "selected" : ""} ${dimClass}`}
      onClick={() => setSelectedNode(id)}
    >
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
          <Handle type="target" position={Position.Left} id="input"
            className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Input</span>
        </div>
      </div>

      <MediaHistory
        nodeId={id}
        history={nodeData.widgetValues?._history || []}
        historyIndex={nodeData.widgetValues?._historyIndex ?? -1}
        fallbackUrl={previewUrl}
        emptyIcon="🔍"
        genTime={nodeData.widgetValues?._genTime}
      />

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button
          className={`localgen-generate-btn ${processing ? "generating" : ""}`}
          onClick={handleUpscale}
          disabled={processing}
        >
          {processing ? "Upscaling..." : "🔍 Upscale"}
        </button>
      </div>

      <div className="upscale-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-output-label">Output</span>
          <Handle type="source" position={Position.Right} id="output_0"
            className={`slot-handle ${outputHL}`} style={{ color: "#64b5f6" }} />
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="type-badge" style={{
      color, borderColor: color + "66", backgroundColor: color + "12",
    }}>{children}</span>
  );
}

export default memo(UpscaleNode);
