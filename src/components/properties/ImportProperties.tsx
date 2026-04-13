import { useRef } from "react";
import { useWorkflowStore } from "../../store/workflowStore";

// ── Import Properties ──────────────────────────────────────────────
function ImportProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const mediaType = data.widgetValues?._mediaType || "none";
  const fileName = data.widgetValues?._fileName || "";
  const fileInfo = data.widgetValues?._fileInfo || {};
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearFile = () => {
    const prev = data.widgetValues?._preview;
    if (prev) URL.revokeObjectURL(prev);
    updateWidgetValue(nodeId, "_mediaType", "none");
    updateWidgetValue(nodeId, "_fileName", "");
    updateWidgetValue(nodeId, "_preview", null);
    updateWidgetValue(nodeId, "_fileInfo", {});
  };

  const replaceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const mime = file.type;
    let type = "none";
    if (mime.startsWith("image/")) type = "image";
    else if (mime.startsWith("video/")) type = "video";
    else if (mime.startsWith("audio/")) type = "audio";

    const url = URL.createObjectURL(file);
    const ext = file.name.split(".").pop()?.toUpperCase() || "";
    updateWidgetValue(nodeId, "_mediaType", type);
    updateWidgetValue(nodeId, "_fileName", file.name);
    updateWidgetValue(nodeId, "_preview", url);
    updateWidgetValue(nodeId, "_fileInfo", { size: formatSize(file.size), format: ext });
  };

  const TYPE_BADGE_COLORS: Record<string, string> = {
    image: "#4ecdc4",
    video: "#ab47bc",
    audio: "#e8a040",
    none: "#888",
  };

  const preview = data.widgetValues?._preview;
  const badgeColor = TYPE_BADGE_COLORS[mediaType];

  if (mediaType === "none") {
    return <div className="props-empty">No file loaded</div>;
  }

  return (
    <>
      {/* Preview for all media types */}
      {preview && mediaType === "image" && (
        <div className="props-preview">
          <img src={preview} alt="" />
        </div>
      )}
      {preview && mediaType === "video" && (
        <div className="props-preview">
          <video src={preview} controls muted style={{ width: "100%", borderRadius: 8 }} />
        </div>
      )}
      {preview && mediaType === "audio" && (
        <div className="props-preview props-audio-preview">
          <audio src={preview} controls style={{ width: "100%" }} />
        </div>
      )}

      {/* Media Info */}
      <div className="props-info-card">
        <div className="props-info-header">
          <span>MEDIA INFO</span>
          <span
            className="props-media-badge"
            style={{
              background: badgeColor + "18",
              border: `1px solid ${badgeColor}`,
              color: badgeColor,
            }}
          >
            {mediaType.toUpperCase()}
          </span>
        </div>

        <div className="props-info-rows">
          {fileName && (
            <div className="props-info-row">
              <span className="props-info-label">Name</span>
              <span className="props-info-value props-truncate">{fileName}</span>
            </div>
          )}
          {fileInfo.resolution && (
            <div className="props-info-row">
              <span className="props-info-label">Resolution</span>
              <span className="props-info-value">{fileInfo.resolution}</span>
            </div>
          )}
          {fileInfo.duration && (
            <div className="props-info-row">
              <span className="props-info-label">Duration</span>
              <span className="props-info-value">{fileInfo.duration}</span>
            </div>
          )}
          {fileInfo.size && (
            <div className="props-info-row">
              <span className="props-info-label">Size</span>
              <span className="props-info-value">{fileInfo.size}</span>
            </div>
          )}
          {fileInfo.format && (
            <div className="props-info-row">
              <span className="props-info-label">Format</span>
              <span className="props-info-value">{fileInfo.format}</span>
            </div>
          )}
          {fileInfo.bitrate && (
            <div className="props-info-row">
              <span className="props-info-label">Bitrate</span>
              <span className="props-info-value">{fileInfo.bitrate}</span>
            </div>
          )}
        </div>
      </div>

      {/* File actions bar */}
      <div className="props-file-bar">
        <span className="props-file-bar-name">{fileName}</span>
        <div className="props-file-bar-btns">
          <button className="props-file-btn" title="Replace file" onClick={() => fileInputRef.current?.click()}>📂</button>
          <button className="props-file-btn props-file-delete" title="Delete file" onClick={clearFile}>🗑</button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*"
          onChange={replaceFile} style={{ display: "none" }} />
      </div>
    </>
  );
}

export default ImportProperties;
