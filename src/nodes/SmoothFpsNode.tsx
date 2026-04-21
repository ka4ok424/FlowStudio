import { memo, useCallback, useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt, getComfyUrl, getImageUrl, uploadImage } from "../api/comfyApi";
import { log } from "../store/logStore";
import { getConnectedImageUrl } from "../hooks/useNodeHelpers";
import { addToHistory } from "../utils/historyLimit";
import { addGenerationToLibrary } from "../store/mediaStore";
import { buildSmoothFpsWorkflow } from "../workflows/smoothFps";
import MediaHistory from "./MediaHistory";

/** Upload a video from its preview URL to ComfyUI /input. Returns the stored filename. */
async function uploadVideoForInput(url: string, fileName: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  // Convert to data URL so we can reuse uploadImage (ComfyUI's /upload/image endpoint takes any file)
  const dataUrl = await new Promise<string>((r) => {
    const rd = new FileReader();
    rd.onloadend = () => r(rd.result as string);
    rd.readAsDataURL(blob);
  });
  return uploadImage(dataUrl, fileName);
}

function SmoothFpsNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const previewUrl = nodeData.widgetValues?._previewUrl || null;
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-detect source fps from connected node (LTX Video / Wan / Hunyuan / Import).
  // Updates the widget when the input edge changes, but only when sourceFps hasn't been
  // manually overridden by the user (i.e. is undefined or matches the default 24).
  useEffect(() => {
    const inputEdge = edgesAll.find((e) => e.target === id && e.targetHandle === "input");
    if (!inputEdge) return;
    const srcNode = nodesAll.find((n) => n.id === inputEdge.source);
    if (!srcNode) return;
    const srcWv = (srcNode.data as any).widgetValues || {};
    // Common fps fields across video-producing nodes
    const baseFps = typeof srcWv.fps === "number" ? srcWv.fps : srcWv._fileInfo?.fps;
    if (!baseFps || typeof baseFps !== "number") return;
    // Account for LTX Temporal x2 upscale doubling fps before our node receives the video
    const detected = srcWv.temporalUpscale ? baseFps * 2 : baseFps;
    const currentVal = nodeData.widgetValues?.sourceFps;
    // Only auto-set when user hasn't manually overridden (default 24 means untouched)
    if (currentVal === undefined || currentVal === 24 || currentVal === detected) {
      if (currentVal !== detected) updateWidgetValue(id, "sourceFps", detected);
    }
  }, [id, edgesAll, nodesAll, nodeData.widgetValues?.sourceFps, updateWidgetValue]);

  const handleGenerate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    setError(null);
    const startTime = Date.now();
    log("Smooth FPS started", { nodeId: id, nodeType: "fs:smoothFps", nodeLabel: "Smooth FPS" });

    const freshWv = (useWorkflowStore.getState().nodes.find((n) => n.id === id)?.data as any)?.widgetValues || {};
    const multiplier = Math.max(2, Math.min(4, freshWv.multiplier ?? 2));
    const model = freshWv.model || "rife49.pth";
    const sourceFps = Math.max(1, Math.min(60, freshWv.sourceFps ?? 24));
    const fastMode = freshWv.fastMode ?? true;
    const ensemble = freshWv.ensemble ?? true;

    const videoEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "input");
    if (!videoEdge) { setError("Connect a video source"); setProcessing(false); return; }
    const srcUrl = getConnectedImageUrl(id, "input", nodesAll as any[], edgesAll as any[]);
    if (!srcUrl) { setError("No video in source. Generate first."); setProcessing(false); return; }

    try {
      const videoName = await uploadVideoForInput(srcUrl, `fs_smooth_${videoEdge.source}_${Date.now()}.mp4`);
      const workflow = buildSmoothFpsWorkflow({ videoName, multiplier, model, sourceFps, fastMode, ensemble });
      const result = await queuePrompt(workflow);
      const promptId = result.prompt_id;

      for (let attempt = 0; attempt < 300; attempt++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const histRes = await fetch(`${getComfyUrl()}/api/history/${promptId}`);
          if (!histRes.ok) continue;
          const history = await histRes.json();
          if (!history[promptId]) continue;

          const outputs = history[promptId].outputs;
          for (const nId of Object.keys(outputs || {})) {
            const media = outputs[nId]?.videos || outputs[nId]?.images || outputs[nId]?.gifs;
            if (media && media.length > 0) {
              const img = media[0];
              const apiUrl = getImageUrl(img.filename, img.subfolder, img.type);

              updateWidgetValue(id, "_genTime", Date.now() - startTime);
              updateWidgetValue(id, "_previewUrl", apiUrl);
              const prevHist: string[] = (useWorkflowStore.getState().nodes.find((n) => n.id === id)?.data as any)?.widgetValues?._history || [];
              const { history: newHist, index: newIdx } = await addToHistory(id, prevHist, apiUrl);
              updateWidgetValue(id, "_history", newHist);
              updateWidgetValue(id, "_historyIndex", newIdx);

              addGenerationToLibrary(apiUrl, {
                prompt: `Smooth FPS x${multiplier} (${model.replace(".pth", "")})`,
                model: `RIFE ${model.replace("rife", "").replace(".pth", "")}`,
                seed: "n/a", nodeType: "fs:smoothFps",
                duration: Date.now() - startTime,
              }, "video");

              log("Smooth FPS complete", { nodeId: id, nodeType: "fs:smoothFps", nodeLabel: "Smooth FPS", status: "success", details: `${multiplier}x ${sourceFps}→${sourceFps * multiplier}fps` });
              setProcessing(false);
              return;
            }
          }
          const st = history[promptId].status;
          if (st?.completed || st?.status_str === "error") {
            const errMsg = history[promptId].status?.messages?.find((m: any) => m[0] === "execution_error");
            setError(errMsg ? errMsg[1]?.exception_message?.slice(0, 120) : "Frame interpolation failed");
            setProcessing(false);
            return;
          }
        } catch { /* keep polling */ }
      }
      setError("Timeout");
      setProcessing(false);
    } catch (err: any) {
      setError(err.message);
      log("Smooth FPS error", { nodeId: id, nodeType: "fs:smoothFps", nodeLabel: "Smooth FPS", status: "error", details: err.message });
      setProcessing(false);
    }
  }, [id, edgesAll, nodesAll, updateWidgetValue]);

  const vidHL = connectingDir === "source" && (connectingType === "VIDEO" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "VIDEO" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(vidHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  const multiplier = nodeData.widgetValues?.multiplier ?? 2;
  const sourceFps = nodeData.widgetValues?.sourceFps ?? 24;

  return (
    <div className={`upscale-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="upscale-node-inner">
        <div className="upscale-accent" style={{ background: "#66bb6a" }} />
        <div className="upscale-header">
          <span className="upscale-icon">⚡</span>
          <div className="upscale-header-text">
            <span className="upscale-title">Smooth FPS</span>
            <span className="upscale-status">
              {processing ? "INTERPOLATING..." : `${multiplier}× · ${sourceFps}→${sourceFps * multiplier}fps`}
            </span>
          </div>
        </div>
      </div>

      <div className="upscale-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="input" className={`slot-handle ${vidHL}`} style={{ color: "#e85d75" }} />
          <TypeBadge color="#e85d75">VID</TypeBadge>
          <span className="nanob-input-label">Input</span>
        </div>
      </div>

      <MediaHistory
        nodeId={id}
        history={nodeData.widgetValues?._history || []}
        historyIndex={nodeData.widgetValues?._historyIndex ?? -1}
        fallbackUrl={previewUrl}
        emptyIcon="⚡"
        genTime={nodeData.widgetValues?._genTime}
        mediaType="video"
      />

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button className={`localgen-generate-btn ${processing ? "generating" : ""}`} onClick={handleGenerate} disabled={processing}>
          {processing ? "Interpolating..." : `⚡ Smooth ${multiplier}×`}
        </button>
      </div>

      <div className="upscale-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <TypeBadge color="#e85d75">VID</TypeBadge>
          <span className="nanob-output-label">Output</span>
          <Handle type="source" position={Position.Right} id="output_0" className={`slot-handle ${outputHL}`} style={{ color: "#e85d75" }} />
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="type-badge" style={{ color, borderColor: color + "66", backgroundColor: color + "12" }}>{children}</span>;
}

export default memo(SmoothFpsNode);
