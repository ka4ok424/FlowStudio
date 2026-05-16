import { memo, useState, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import WaveformPlayer from "../components/WaveformPlayer";

function PreviewNode({ id, data: _data, selected }: NodeProps) {
  void _data;
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const [fullscreen, setFullscreen] = useState(false);

  // Node types that produce video / audio (used to detect mediaType when
  // upstream stores the URL as a blob: that doesn't reveal MIME).
  const VIDEO_SOURCE_TYPES = new Set([
    "fs:videoGen", "fs:videoGenPro",
    "fs:ltxVideo", "fs:wanVideo", "fs:wanAnimate", "fs:wanSmooth",
    "fs:hunyuanVideo", "fs:hunyuanAvatar",
    "fs:smoothFps",
    "fs:montage", "fs:mmaudio",
  ]);
  const AUDIO_SOURCE_TYPES = new Set(["fs:music", "fs:tts", "fs:omnivoiceTts", "fs:omnivoiceClone"]);

  // Find connected source
  const inputEdge = edgesAll.find((e) => e.target === id && e.targetHandle === "input");
  let previewUrl: string | null = null;
  let mediaType: string = "none";

  if (inputEdge) {
    const sourceNode = nodesAll.find((n) => n.id === inputEdge.source);
    if (sourceNode) {
      const srcData = sourceNode.data as any;
      const srcType: string = srcData.type || "";
      const wv = srcData.widgetValues || {};

      // 1. Resolve URL.
      // Multi-output sources (e.g. fs:multiCrop) store per-cell blobs in
      // `_cellPreviews` keyed by handle id (`out_1`, `out_2`...). Use
      // `inputEdge.sourceHandle` to pick the correct cell — otherwise all
      // downstream Previews would show cell 1.
      if (wv._cellPreviews && inputEdge.sourceHandle) {
        previewUrl = wv._cellPreviews[inputEdge.sourceHandle] || null;
      }
      // Fall back to single-output preview (generators, Import, etc.)
      if (!previewUrl) {
        previewUrl = wv._previewUrl || wv._preview || wv._audioUrl || null;
      }

      // 2. Resolve mediaType — trust upstream's explicit hint first.
      if (wv._mediaType && wv._mediaType !== "none") {
        mediaType = wv._mediaType;
      } else if (wv._audioUrl) {
        mediaType = "audio";
      } else if (VIDEO_SOURCE_TYPES.has(srcType)) {
        mediaType = "video";
      } else if (AUDIO_SOURCE_TYPES.has(srcType)) {
        mediaType = "audio";
      } else if (previewUrl?.startsWith("data:video/")) {
        mediaType = "video";
      } else if (previewUrl?.startsWith("data:audio/")) {
        mediaType = "audio";
      } else if (previewUrl && /\.(mp4|mov|webm|mkv|avi|m4v)(\?|#|&|$)/i.test(previewUrl)) {
        // ComfyUI /api/view URLs put extension before `&subfolder=...`; match `&` too
        mediaType = "video";
      } else if (previewUrl && /\.(mp3|wav|ogg|flac|m4a)(\?|#|&|$)/i.test(previewUrl)) {
        mediaType = "audio";
      } else if (previewUrl) {
        mediaType = "image";
      }
    }
  }

  const inputHL =
    connectingDir === "source" &&
    (connectingType === "IMAGE" || connectingType === "VIDEO" || connectingType === "AUDIO" || connectingType === "MEDIA" || connectingType === "*")
      ? "highlight" : "";

  const handleDownload = useCallback(() => {
    if (!previewUrl) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    const ext = mediaType === "video" ? "mp4" : mediaType === "audio" ? "wav" : "png";
    a.download = `flowstudio_preview_${Date.now()}.${ext}`;
    a.click();
  }, [previewUrl]);

  const hasCompatible = connectingType ? !!inputHL : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  return (
    <>
      <div
        className={`preview-node ${selected ? "selected" : ""} ${dimClass}`}
        onClick={() => setSelectedNode(id)}
      >
        <div className="preview-node-inner">
          <div className="preview-accent" />
          <div className="preview-header">
            <span className="preview-icon">👁</span>
            <span className="preview-title">Preview</span>
          </div>
        </div>

        {/* Input handle */}
        <div className="preview-input-row">
          <Handle type="target" position={Position.Left} id="input"
            className={`slot-handle ${inputHL}`}
            style={{ color: mediaType === "video" ? "#e85d75" : mediaType === "audio" ? "#ec4899" : "#64b5f6" }} />
          <TypeBadge color="#64b5f6">MEDIA</TypeBadge>
          <span className="preview-input-label">Input</span>
        </div>

        {/* Preview area */}
        <div className="preview-content" onClick={() => previewUrl && setFullscreen(true)}>
          {previewUrl && mediaType === "image" && (
            <img src={previewUrl} alt="Preview" className="preview-img" />
          )}
          {previewUrl && mediaType === "video" && (
            <video src={previewUrl} className="preview-video" controls />
          )}
          {previewUrl && mediaType === "audio" && (
            <div style={{ width: "100%", padding: "8px 10px", boxSizing: "border-box" }} onClick={(e) => e.stopPropagation()}>
              <WaveformPlayer url={previewUrl} />
            </div>
          )}
          {!previewUrl && (
            <div className="preview-empty">
              <span className="preview-empty-icon">👁</span>
              <span className="preview-empty-text">Connect a source</span>
            </div>
          )}
        </div>

        {/* Actions */}
        {previewUrl && (
          <div className="preview-actions">
            <button className="preview-btn" onClick={() => setFullscreen(true)} title="Fullscreen">⛶</button>
            <button className="preview-btn" onClick={handleDownload} title="Download">⬇</button>
          </div>
        )}
      </div>

      {/* Fullscreen overlay */}
      {fullscreen && previewUrl && (
        <div className="preview-fullscreen" onClick={() => setFullscreen(false)}>
          {mediaType === "video" ? (
            <video src={previewUrl} className="preview-fullscreen-img" controls autoPlay onClick={(e) => e.stopPropagation()} />
          ) : mediaType === "audio" ? (
            <div style={{ width: "60%", maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
              <WaveformPlayer url={previewUrl} />
            </div>
          ) : (
            <img src={previewUrl} alt="Fullscreen" className="preview-fullscreen-img" />
          )}
          <button className="preview-fullscreen-close" onClick={() => setFullscreen(false)}>✕</button>
        </div>
      )}
    </>
  );
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="type-badge" style={{
      color, borderColor: color + "66", backgroundColor: color + "12",
    }}>{children}</span>
  );
}

export default memo(PreviewNode);
