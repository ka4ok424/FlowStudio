import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { dataUrlToBlobUrl } from "../utils/blobUrl";

const VIDEO_COLOR = "#e85d75";
const IMAGE_COLOR = "#64b5f6";

const SENTINEL_LAST = -1;

function formatTimecode(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "00:00:000";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(ms).padStart(3, "0")}`;
}

async function extractFrameLossless(
  videoUrl: string,
  frameIndex: number,
  fps: number,
  totalFrames: number,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = videoUrl;

  await new Promise<void>((resolve, reject) => {
    const onMeta = () => { video.removeEventListener("error", onErr); resolve(); };
    const onErr = () => { video.removeEventListener("loadedmetadata", onMeta); reject(new Error("Failed to load video")); };
    video.addEventListener("loadedmetadata", onMeta, { once: true });
    video.addEventListener("error", onErr, { once: true });
  });

  const safeFps = fps > 0 ? fps : 30;
  const safeTotal = totalFrames > 0 ? totalFrames : Math.max(1, Math.round(video.duration * safeFps));
  const resolved = frameIndex < 0 ? safeTotal - 1 : Math.min(frameIndex, safeTotal - 1);
  const targetTime = Math.min((resolved + 0.5) / safeFps, video.duration - 0.0001);

  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; resolve(); };
    if ("requestVideoFrameCallback" in video) {
      const onSeeked = () => {
        (video as any).requestVideoFrameCallback(() => finish());
      };
      video.addEventListener("seeked", onSeeked, { once: true });
    } else {
      video.addEventListener("seeked", () => finish(), { once: true });
    }
    video.currentTime = targetTime;
    setTimeout(finish, 4000);
  });

  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("Video has no dimensions");

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(video, 0, 0, w, h);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

  video.src = "";
  return { dataUrl, width: w, height: h };
}

function FrameExtractNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const videoEdge = edgesAll.find((e: any) => e.target === id && e.targetHandle === "video");
  const srcNode = videoEdge ? nodesAll.find((n: any) => n.id === videoEdge.source) : null;
  const sd = srcNode?.data as any;
  const videoUrl: string | null = sd?.widgetValues?._preview || sd?.widgetValues?._previewUrl || null;
  const srcInfo = sd?.widgetValues?._fileInfo || {};
  const upstreamFps: number = typeof srcInfo.fps === "number" ? srcInfo.fps : 0;
  const upstreamFrames: number = typeof srcInfo.frames === "number" ? srcInfo.frames : 0;

  const videoRef = useRef<HTMLVideoElement>(null);
  const lastExtractedRef = useRef<{ url: string; frame: number } | null>(null);
  // Lock + coalesce: at most ONE extract runs at a time. New scrub positions
  // overwrite `pending`; the active runner picks them up after each iteration.
  const runStateRef = useRef<{
    running: boolean;
    pending: { url: string; frame: number; fps: number; totalFrames: number } | null;
  }>({ running: false, pending: null });

  const [duration, setDuration] = useState(0);
  const [localFps, setLocalFps] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(videoUrl);
  const [dragging, setDragging] = useState(false);
  const [aspect, setAspect] = useState<number>(16 / 9);

  const fps = upstreamFps > 0 ? upstreamFps : (localFps > 0 ? localFps : 30);
  const totalFrames = upstreamFrames > 0
    ? upstreamFrames
    : (duration > 0 ? Math.max(1, Math.round(duration * fps)) : 0);

  const frameIndex: number = nodeData.widgetValues?.frameIndex ?? SENTINEL_LAST;
  const previewUrl: string | null = nodeData.widgetValues?._previewUrl || null;
  const extractedFrame: number | null = nodeData.widgetValues?._extractedFrame ?? null;

  const effectiveFrame = frameIndex < 0
    ? Math.max(0, totalFrames - 1)
    : Math.min(frameIndex, Math.max(0, totalFrames - 1));
  const effectiveTime = totalFrames > 0 ? effectiveFrame / fps : 0;

  // Reset to last-frame default when source changes
  useEffect(() => {
    setPreviewSrc(videoUrl);
    setError(null);
    if (videoUrl !== nodeData.widgetValues?._lastSourceUrl) {
      updateWidgetValue(id, "_lastSourceUrl", videoUrl);
      updateWidgetValue(id, "frameIndex", SENTINEL_LAST);
      updateWidgetValue(id, "_extractedFrame", null);
      lastExtractedRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl, id]);

  // Visual scrub: seek the visible <video> to the chosen frame (instant)
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoUrl || totalFrames === 0) return;
    const target = (effectiveFrame + 0.5) / fps;
    if (Math.abs(v.currentTime - target) > 1 / (fps * 2)) {
      try { v.currentTime = Math.min(target, v.duration - 0.0001); } catch { /* ignore */ }
    }
  }, [effectiveFrame, fps, videoUrl, totalFrames]);

  // Lossless extraction (lock + coalesce, no debounce).
  // While slider is being dragged → no extract at all (user still picking).
  // On release → effect re-runs (dragging flips false) and extracts final frame.
  useEffect(() => {
    if (dragging) return;
    if (!videoUrl || totalFrames === 0) return;
    const last = lastExtractedRef.current;
    if (last && last.url === videoUrl && last.frame === effectiveFrame) return;

    runStateRef.current.pending = { url: videoUrl, frame: effectiveFrame, fps, totalFrames };

    if (runStateRef.current.running) return;
    runStateRef.current.running = true;
    setExtracting(true);
    setError(null);

    (async () => {
      try {
        while (runStateRef.current.pending) {
          const target = runStateRef.current.pending;
          runStateRef.current.pending = null;

          const lp = lastExtractedRef.current;
          if (lp && lp.url === target.url && lp.frame === target.frame) continue;

          const { dataUrl, width, height } = await extractFrameLossless(
            target.url, target.frame, target.fps, target.totalFrames,
          );

          // Source switched while we were extracting → discard stale result.
          const next = runStateRef.current.pending;
          if (next && next.url !== target.url) continue;

          const blobUrl = dataUrlToBlobUrl(dataUrl);
          updateWidgetValue(id, "_previewUrl", blobUrl);
          updateWidgetValue(id, "_extractedFrame", target.frame);
          updateWidgetValue(id, "_extractedSize", `${width} × ${height}`);
          lastExtractedRef.current = { url: target.url, frame: target.frame };
        }
      } catch (err: any) {
        setError(err?.message || "Extraction failed");
      } finally {
        runStateRef.current.running = false;
        setExtracting(false);
      }
    })();
  }, [videoUrl, effectiveFrame, fps, totalFrames, dragging, id, updateWidgetValue]);

  const onMeta = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    if (v.videoWidth > 0 && v.videoHeight > 0) {
      setAspect(v.videoWidth / v.videoHeight);
    }
    if (upstreamFps === 0 && localFps === 0) setLocalFps(30);
  }, [upstreamFps, localFps]);

  const onSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    updateWidgetValue(id, "frameIndex", val);
  }, [id, updateWidgetValue]);

  const onSliderPointerDown = useCallback(() => {
    setDragging(true);
    const onUp = () => {
      setDragging(false);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, []);

  const isFresh = !extracting && extractedFrame !== null && extractedFrame === effectiveFrame && previewUrl;

  // Handle highlight + dim
  const inHL = connectingDir === "source" && (connectingType === "VIDEO" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const outHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(inHL || outHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  return (
    <div className={`frameex-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="frameex-node-inner">
        <div className="frameex-accent" />
        <div className="frameex-header">
          <span className="frameex-icon">🎞</span>
          <div className="frameex-header-text">
            <span className="frameex-title">Frame Extract</span>
            <span className="frameex-status">
              {!videoUrl ? "NO VIDEO"
                : error ? "ERROR"
                : dragging ? "SCRUBBING…"
                : extracting ? "EXTRACTING…"
                : isFresh ? "FRESH"
                : "PENDING"}
            </span>
          </div>
        </div>
      </div>

      <div className="frameex-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="video" className={`slot-handle ${inHL}`} style={{ color: VIDEO_COLOR }} />
          <span className="type-badge" style={{ color: VIDEO_COLOR, borderColor: VIDEO_COLOR + "66", backgroundColor: VIDEO_COLOR + "12" }}>VIDEO</span>
          <span className="nanob-input-label">Video</span>
        </div>
      </div>

      <div
        className="frameex-preview nodrag"
        onClick={(e) => e.stopPropagation()}
        style={videoUrl ? {
          aspectRatio: `${aspect}`,
          maxHeight: 540,
          minHeight: aspect > 1 ? undefined : 200,
        } : undefined}
      >
        {videoUrl ? (
          <video
            ref={videoRef}
            src={previewSrc || undefined}
            className="frameex-preview-video"
            muted
            playsInline
            preload="auto"
            crossOrigin="anonymous"
            onLoadedMetadata={onMeta}
          />
        ) : (
          <div className="frameex-placeholder">Connect a VIDEO input</div>
        )}
      </div>

      {videoUrl && totalFrames > 0 && (
        <div className="frameex-controls nodrag" onClick={(e) => e.stopPropagation()}>
          <input
            type="range"
            className="frameex-slider"
            min={0}
            max={Math.max(0, totalFrames - 1)}
            step={1}
            value={effectiveFrame}
            onChange={onSliderChange}
            onPointerDown={onSliderPointerDown}
          />
          <div className="frameex-meta">
            <span>
              <span className="frameex-meta-label">Frame:</span>{" "}
              <span className="frameex-meta-value">{effectiveFrame}</span>
            </span>
            <span>
              <span className="frameex-meta-label">Timecode:</span>{" "}
              <span className="frameex-meta-value">{formatTimecode(effectiveTime)}</span>
            </span>
          </div>
        </div>
      )}

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="frameex-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <span className="type-badge" style={{ color: IMAGE_COLOR, borderColor: IMAGE_COLOR + "66", backgroundColor: IMAGE_COLOR + "12" }}>IMAGE</span>
          <span className="nanob-output-label">Frame</span>
          <Handle type="source" position={Position.Right} id="output_0" className={`slot-handle ${outHL}`} style={{ color: IMAGE_COLOR }} />
        </div>
      </div>
    </div>
  );
}

export default memo(FrameExtractNode);
