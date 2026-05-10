import { memo, useCallback, useState, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt, getImageUrl, uploadImage, getComfyUrl, stopAll } from "../api/comfyApi";
import { addGenerationToLibrary } from "../store/mediaStore";
import MediaHistory from "./MediaHistory";
import { addToHistory } from "../utils/historyLimit";
import { log } from "../store/logStore";
import { buildWanSmoothWorkflow, SMOOTH_NEGATIVE_DEFAULT } from "../workflows/wanSmooth";

function WanSmoothNode({ id, data, selected }: NodeProps) {
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
  const abortRef = useRef(false);

  const getConnectedImage = (handleId: string): string | null => {
    const edge = edgesAll.find((e) => e.target === id && e.targetHandle === handleId);
    if (!edge) return null;
    const srcNode = nodesAll.find((n) => n.id === edge.source);
    if (!srcNode) return null;
    const sd = srcNode.data as any;
    return sd.widgetValues?._previewUrl || sd.widgetValues?._preview || sd.widgetValues?.portraitUrl || null;
  };

  const handleGenerate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    setError(null);
    abortRef.current = false;
    const startTime = Date.now();

    const wv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const steps = wv.steps || 20;
    const cfg = wv.cfg ?? 6.0;
    const shift = wv.shift ?? 5.0;
    const width = wv.width || 720;
    const height = wv.height || 1280;
    const numFrames = wv.numFrames || 49;
    const fps = wv.fps || 16;
    const rifeMultiplier = wv.rifeMultiplier ?? 2;
    const modelName = wv.modelName || "wan2.2_ti2v_5B_fp16.safetensors";
    const vaeName = wv.vaeName || "Wan2.2_VAE.pth";
    const clipName = wv.clipName || "umt5_xxl_fp8_e4m3fn_scaled.safetensors";
    const samplerName = wv.samplerName || "uni_pc";
    const scheduler = wv.scheduler || "simple";
    const seed = wv.seed ? parseInt(wv.seed) : Math.floor(Math.random() * 2147483647);

    let promptText = "";
    const promptEdge = edgesAll.find((e) => e.target === id && e.targetHandle === "prompt");
    if (promptEdge) {
      const promptNode = nodesAll.find((n) => n.id === promptEdge.source);
      if (promptNode) promptText = (promptNode.data as any).widgetValues?.text || "";
    }
    if (!promptText) { setError("Connect a Prompt node"); setProcessing(false); return; }

    try {
      let startImageName: string | null = null;
      const startImageUrl = getConnectedImage("start_image");
      if (startImageUrl) {
        const fileName = `fs_wansmooth_start_${id}.png`;
        if (startImageUrl.startsWith("data:")) {
          startImageName = await uploadImage(startImageUrl, fileName);
        } else {
          const resp = await fetch(startImageUrl);
          const blob = await resp.blob();
          const dataUrl = await new Promise<string>((r) => { const rd = new FileReader(); rd.onloadend = () => r(rd.result as string); rd.readAsDataURL(blob); });
          startImageName = await uploadImage(dataUrl, fileName);
        }
      }

      const workflow = buildWanSmoothWorkflow({
        prompt: promptText,
        negativePrompt: wv.negativePrompt || SMOOTH_NEGATIVE_DEFAULT,
        seed, steps, cfg, shift, width, height, numFrames, fps,
        startImageName, rifeMultiplier, modelName, vaeName, clipName,
        samplerName, scheduler,
      });

      log("Wan Smooth rendering", { nodeId: id, nodeType: "fs:wanSmooth", nodeLabel: "Wan Smooth" });
      const result = await queuePrompt(workflow);
      const promptId = result.prompt_id;

      for (let attempt = 0; attempt < 600; attempt++) {
        if (abortRef.current) { setError("Stopped"); setProcessing(false); return; }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          const histRes = await fetch(`${getComfyUrl()}/api/history/${promptId}`);
          if (!histRes.ok) continue;
          const history = await histRes.json();
          if (history[promptId]) {
            const outputs = history[promptId].outputs;
            for (const nId of Object.keys(outputs || {})) {
              const media = outputs[nId]?.videos || outputs[nId]?.images || outputs[nId]?.gifs;
              if (media && media.length > 0) {
                const img = media[0];
                const apiUrl = getImageUrl(img.filename, img.subfolder, img.type);
                updateWidgetValue(id, "_genTime", Date.now() - startTime);
                updateWidgetValue(id, "_previewUrl", apiUrl);
                const prevHist: string[] = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues?._history || [];
                const { history: newHist, index: newIdx } = await addToHistory(id, prevHist, apiUrl);
                updateWidgetValue(id, "_history", newHist);
                updateWidgetValue(id, "_historyIndex", newIdx);
                log("Wan Smooth complete", { nodeId: id, nodeType: "fs:wanSmooth", nodeLabel: "Wan Smooth", status: "success" });
                addGenerationToLibrary(apiUrl, {
                  prompt: promptText, model: `${modelName} (RIFE×${rifeMultiplier})`, seed: String(seed),
                  steps, cfg, width, height, nodeType: "fs:wanSmooth", duration: Date.now() - startTime,
                }, "video");
                setProcessing(false);
                return;
              }
            }
            const st = history[promptId].status;
            if (st?.completed || st?.status_str === "error") {
              const errMsg = history[promptId].status?.messages?.find((m: any) => m[0] === "execution_error");
              setError(errMsg ? errMsg[1]?.exception_message?.slice(0, 120) : "Generation failed");
              setProcessing(false);
              return;
            }
          }
        } catch { /* keep polling */ }
      }
      setError("Timeout"); setProcessing(false);
    } catch (err: any) {
      setError(err.message);
      log("Wan Smooth error", { nodeId: id, nodeType: "fs:wanSmooth", nodeLabel: "Wan Smooth", status: "error", details: err.message });
      setProcessing(false);
    }
  }, [id, edgesAll, nodesAll, updateWidgetValue]);

  const imgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const promptHL = connectingDir === "source" && (connectingType === "TEXT" || connectingType === "*") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "VIDEO" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(imgHL || promptHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  const wv = nodeData.widgetValues || {};
  const numFrames = wv.numFrames || 49;
  const fps = wv.fps || 16;
  const rifeMultiplier = wv.rifeMultiplier ?? 2;
  const finalFps = fps * Math.max(1, rifeMultiplier);
  const duration = (numFrames / fps).toFixed(1);

  return (
    <div className={`wansmooth-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="wansmooth-node-inner">
        <div className="wansmooth-accent" />
        <div className="wansmooth-header">
          <span className="wansmooth-icon">✨</span>
          <div className="wansmooth-header-text">
            <span className="wansmooth-title">Wan Smooth</span>
            <span className="wansmooth-status">
              {processing
                ? "RENDERING..."
                : `Wan 2.2 + RIFE×${rifeMultiplier} · ${duration}s @ ${finalFps}fps`}
            </span>
          </div>
        </div>
      </div>

      <div className="wansmooth-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="prompt" className={`slot-handle ${promptHL}`} style={{ color: "#f0c040" }} />
          <TypeBadge color="#f0c040">TXT</TypeBadge>
          <span className="nanob-input-label">Prompt</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="start_image" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Start Image</span>
        </div>
      </div>

      <MediaHistory
        nodeId={id}
        history={nodeData.widgetValues?._history || []}
        historyIndex={nodeData.widgetValues?._historyIndex ?? -1}
        fallbackUrl={previewUrl}
        emptyIcon="✨"
        mediaType="video"
        genTime={nodeData.widgetValues?._genTime}
      />

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        {processing ? (
          <button className="localgen-generate-btn generating" onClick={(e) => {
            e.stopPropagation();
            abortRef.current = true;
            stopAll().catch(() => {});
          }}>
            Stop
          </button>
        ) : (
          <button className="localgen-generate-btn" onClick={handleGenerate} disabled={processing} style={{ flex: 1 }}>
            ✨ Generate Smooth
          </button>
        )}
      </div>

      <div className="wansmooth-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <TypeBadge color="#e85d75">VID</TypeBadge>
          <span className="nanob-output-label">Video</span>
          <Handle type="source" position={Position.Right} id="output_0" className={`slot-handle ${outputHL}`} style={{ color: "#e85d75" }} />
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="type-badge" style={{ color, borderColor: color + "66", backgroundColor: color + "12" }}>{children}</span>;
}

export default memo(WanSmoothNode);
