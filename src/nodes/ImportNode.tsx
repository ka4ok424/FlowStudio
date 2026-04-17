import { memo, useCallback, useRef, useState, useEffect } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { processImportFile, type ImportMediaType as MediaType } from "../utils/importFile";
import { makeDragGhost, findGhostSource } from "../utils/dragGhost";

const TYPE_COLORS: Record<MediaType, string> = {
  none: "#888888", image: "#64b5f6", video: "#e85d75", audio: "#e8a040",
};
const TYPE_LABELS: Record<MediaType, string> = {
  none: "MEDIA", image: "IMAGE", video: "VIDEO", audio: "AUDIO",
};

function ImportNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mediaType, setMediaType] = useState<MediaType>(nodeData.widgetValues?._mediaType || "none");
  const [preview, setPreview] = useState<string | null>(nodeData.widgetValues?._preview || null);
  const [fileName, setFileName] = useState<string>(nodeData.widgetValues?._fileName || "");
  const [dragOver, setDragOver] = useState(false);
  const [hoverPreview, setHoverPreview] = useState(false);

  const handleFile = useCallback((file: File) => {
    const { type, url } = processImportFile(file, {
      setValue: (key, value) => updateWidgetValue(id, key, value),
    });
    setMediaType(type);
    setFileName(file.name);
    setPreview(url);
  }, [id, updateWidgetValue]);

  const clearFile = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (preview) URL.revokeObjectURL(preview);
    setMediaType("none");
    setPreview(null);
    setFileName("");
    updateWidgetValue(id, "_mediaType", "none");
    updateWidgetValue(id, "_fileName", "");
    updateWidgetValue(id, "_preview", null);
    updateWidgetValue(id, "_fileInfo", {});
  }, [id, preview, updateWidgetValue]);

  // Draw audio waveform
  useEffect(() => {
    if (mediaType !== "audio" || !preview || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const audioCtx = new AudioContext();
    fetch(preview)
      .then((r) => r.arrayBuffer())
      .then((buf) => audioCtx.decodeAudioData(buf))
      .then((audioBuffer) => {
        const raw = audioBuffer.getChannelData(0);
        const w = canvas.width;
        const h = canvas.height;
        const step = Math.ceil(raw.length / w);

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#e8a040";
        const mid = h / 2;

        for (let i = 0; i < w; i++) {
          let min = 1, max = -1;
          for (let j = 0; j < step; j++) {
            const val = raw[i * step + j] || 0;
            if (val < min) min = val;
            if (val > max) max = val;
          }
          const barH = Math.max(1, (max - min) * mid * 0.9);
          ctx.globalAlpha = 0.7;
          ctx.fillRect(i, mid - barH / 2, 1, barH);
        }
        audioCtx.close();
      })
      .catch(() => {});
  }, [mediaType, preview]);

  const handleMediaDrop = useCallback((url: string, fileName: string, type: string) => {
    let mt: MediaType = "none";
    if (type === "image") mt = "image";
    else if (type === "video") mt = "video";
    else if (type === "audio") mt = "audio";

    setMediaType(mt);
    setFileName(fileName);
    setPreview(url);

    updateWidgetValue(id, "_mediaType", mt);
    updateWidgetValue(id, "_fileName", fileName);
    updateWidgetValue(id, "_preview", url);
    updateWidgetValue(id, "_fileInfo", { source: "media-library" });
  }, [id, updateWidgetValue]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragOver(false);

    // Check for media library drop first
    const mediaData = e.dataTransfer.getData("application/flowstudio-media");
    if (mediaData) {
      try {
        const { url, fileName: fn, type } = JSON.parse(mediaData);
        if (url) { handleMediaDrop(url, fn, type); return; }
      } catch { /* fall through to file drop */ }
    }

    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile, handleMediaDrop]);

  const portColor = TYPE_COLORS[mediaType];
  const actualType = TYPE_LABELS[mediaType];
  const outputHighlight =
    connectingDir === "target" && connectingType &&
    (connectingType === actualType || connectingType === "MEDIA" || connectingType === "*" ||
     (mediaType === "none" && ["IMAGE", "VIDEO", "AUDIO"].includes(connectingType)))
      ? "highlight" : "";

  const hasCompatible = connectingType ? !!outputHighlight : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  return (
    <div
      className={`import-node ${selected ? "selected" : ""} ${dimClass}`}
      onClick={() => setSelectedNode(id)}
    >
      <div className="import-node-inner">
        <div className="import-accent" />
        <div className="import-header">
          <span className="import-icon">⬆</span>
          <div className="import-header-text">
            <span className="import-title">Import</span>
            <span className="import-status">{mediaType === "none" ? "IDLE" : actualType}</span>
          </div>
        </div>
      </div>

      <div
        className={`import-dropzone nodrag ${dragOver ? "drag-over" : ""} ${preview ? "has-preview" : ""}`}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => { if (!preview) fileInputRef.current?.click(); }}
        onMouseEnter={() => setHoverPreview(true)}
        onMouseLeave={() => setHoverPreview(false)}
        draggable={!!preview}
        onDragStart={(e) => {
          if (!preview || mediaType === "none") return;
          e.stopPropagation();
          e.dataTransfer.setData("application/flowstudio-media", JSON.stringify({
            url: preview, fileName: fileName || "import", type: mediaType,
          }));
          e.dataTransfer.effectAllowed = "copy";
          const src = findGhostSource(e.currentTarget as HTMLElement);
          if (src) {
            const ghost = makeDragGhost(src, 120);
            e.dataTransfer.setDragImage(ghost, ghost.width / 2, ghost.height / 2);
          }
        }}
      >
        {preview && mediaType === "image" && (
          <img src={preview} alt={fileName} className="import-preview-img" draggable={false} />
        )}
        {preview && mediaType === "video" && (
          <video src={preview} className="import-preview-video" controls muted />
        )}
        {preview && mediaType === "audio" && (
          <AudioPlayer src={preview} canvasRef={canvasRef} />
        )}
        {!preview && (
          <div className="import-placeholder">
            <div className="import-upload-icon">⬆</div>
            <div className="import-upload-text">Drop image, video or audio</div>
            <div className="import-upload-sub">— or —</div>
            <div className="import-upload-browse">Click to browse</div>
          </div>
        )}

        {preview && hoverPreview && (
          <div className="import-overlay">
            <button className="import-overlay-btn import-delete" onClick={clearFile} title="Remove file">
              ✕
            </button>
          </div>
        )}

        {preview && nodeData.widgetValues?._fileInfo && (() => {
          const fi = nodeData.widgetValues._fileInfo;
          const parts: string[] = [];
          if (fi.resolution) parts.push(fi.resolution);
          if (fi.duration) parts.push(fi.duration);
          if (fi.fps) parts.push(`${fi.fps}fps`);
          if (fi.frames) parts.push(`${fi.frames}f`);
          return parts.length > 0 ? (
            <div className="import-media-info nodrag">{parts.join(" · ")}</div>
          ) : null;
        })()}

        <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          style={{ display: "none" }} />
      </div>

      <Handle type="source" position={Position.Right} id="output_0"
        className={`slot-handle ${outputHighlight}`}
        style={{ color: portColor, top: "50px" }} />
    </div>
  );
}

// ── Custom Audio Player with waveform ──────────────────────────────
function AudioPlayer({ src, canvasRef }: { src: string; canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); }
    else { audioRef.current.play(); }
    setPlaying(!playing);
  }, [playing]);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  // Seek by clicking on waveform
  const seekOnCanvas = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    if (!canvasRef.current || !audioRef.current || !duration) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = pct * duration;
    setCurrentTime(pct * duration);
  }, [canvasRef, duration]);

  // Draw playhead on waveform
  useEffect(() => {
    if (!canvasRef.current || !duration) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Redraw waveform with playhead
    const pct = currentTime / duration;
    const x = pct * canvas.width;

    // The waveform is already drawn, just overlay playhead line
    // We need to save waveform data... for simplicity, draw a progress overlay
    ctx.save();
    ctx.fillStyle = "rgba(100, 181, 246, 0.15)";
    ctx.fillRect(0, 0, x, canvas.height);
    ctx.restore();
  }, [currentTime, duration, canvasRef]);

  return (
    <div className="import-audio-wrap" onClick={(e) => e.stopPropagation()}>
      <canvas
        ref={canvasRef}
        className="import-waveform"
        width={280}
        height={50}
        onClick={seekOnCanvas}
        style={{ cursor: "pointer" }}
      />
      <div className="audio-controls">
        <button className="audio-play-btn" onClick={toggle}>
          {playing ? "❚❚" : "▶"}
        </button>
        <span className="audio-time">{fmt(currentTime)} / {fmt(duration)}</span>
      </div>
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={() => { if (audioRef.current) setDuration(audioRef.current.duration); }}
        onTimeUpdate={() => { if (audioRef.current) setCurrentTime(audioRef.current.currentTime); }}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
}

export default memo(ImportNode);
