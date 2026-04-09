import { memo, useState, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";

function PreviewNode({ id, data: _data, selected }: NodeProps) {
  void _data;
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const [fullscreen, setFullscreen] = useState(false);

  // Find connected source image
  const inputEdge = edgesAll.find((e) => e.target === id && e.targetHandle === "input");
  let previewUrl: string | null = null;
  let mediaType: string = "none";

  if (inputEdge) {
    const sourceNode = nodesAll.find((n) => n.id === inputEdge.source);
    if (sourceNode) {
      const srcData = sourceNode.data as any;
      const srcType = srcData.type || "";

      // From Import
      if (srcData.widgetValues?._preview) {
        previewUrl = srcData.widgetValues._preview;
        mediaType = srcData.widgetValues._mediaType || "image";
      }
      // From generation nodes (_previewUrl)
      if (srcData.widgetValues?._previewUrl) {
        previewUrl = srcData.widgetValues._previewUrl;
        // Detect media type from source node type or URL
        if (srcType === "fs:videoGen") {
          mediaType = "video";
        } else if (srcType === "fs:music" || srcType === "fs:tts") {
          mediaType = "audio";
        } else if (previewUrl.startsWith("data:video/")) {
          mediaType = "video";
        } else if (previewUrl.startsWith("data:audio/")) {
          mediaType = "audio";
        } else {
          mediaType = "image";
        }
      }
      // Audio from Music/TTS nodes
      if (srcData.widgetValues?._audioUrl) {
        previewUrl = srcData.widgetValues._audioUrl;
        mediaType = "audio";
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
            style={{ color: mediaType === "video" ? "#e85d75" : mediaType === "audio" ? "#e8a040" : "#64b5f6" }} />
          <TypeBadge color="#64b5f6">MEDIA</TypeBadge>
          <span className="preview-input-label">Input</span>
        </div>

        {/* Preview area */}
        <div className="preview-content" onClick={() => previewUrl && setFullscreen(true)}>
          {previewUrl && mediaType === "image" && (
            <img src={previewUrl} alt="Preview" className="preview-img" />
          )}
          {previewUrl && mediaType === "video" && (
            <video src={previewUrl} className="preview-video" controls muted />
          )}
          {previewUrl && mediaType === "audio" && (
            <audio src={previewUrl} controls style={{ width: "100%" }} />
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
            <audio src={previewUrl} controls autoPlay onClick={(e) => e.stopPropagation()} style={{ width: "80%" }} />
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
