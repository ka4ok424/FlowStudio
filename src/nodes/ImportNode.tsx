import { memo, useCallback, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { processImportFile, type ImportMediaType as MediaType } from "../utils/importFile";
import { makeDragGhost, findGhostSource } from "../utils/dragGhost";
import { uploadOnce, inputFileUrl } from "../api/comfyApi";
import WaveformPlayer from "../components/WaveformPlayer";

const TYPE_COLORS: Record<MediaType, string> = {
  none: "#888888", image: "#64b5f6", video: "#e85d75", audio: "#ec4899",
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
  const [mediaType, setMediaType] = useState<MediaType>(nodeData.widgetValues?._mediaType || "none");
  const [preview, setPreview] = useState<string | null>(nodeData.widgetValues?._preview || null);
  const [fileName, setFileName] = useState<string>(nodeData.widgetValues?._fileName || "");
  const [dragOver, setDragOver] = useState(false);
  const [hoverPreview, setHoverPreview] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "uploaded" | "failed">(
    nodeData.widgetValues?._previewUrl ? "uploaded" : "idle"
  );

  /** Background: upload the file to ComfyUI input/, store the HTTP URL in
   *  `_previewUrl`. Downstream nodes (LtxFml etc.) read `_previewUrl` first
   *  in `getConnectedMedia`, so once this resolves they get a server URL
   *  that survives blob-revocation, page reloads, and tab restarts. The
   *  local blob URL stays in `_preview` for fast in-node rendering. */
  const uploadInBackground = useCallback(async (sourceUrl: string, originalName: string) => {
    if (!sourceUrl) return;
    setUploadStatus("uploading");
    try {
      const dot = originalName.lastIndexOf(".");
      const ext = dot > 0 ? originalName.slice(dot + 1).toLowerCase() : "bin";
      const filename = await uploadOnce(sourceUrl, ext);
      updateWidgetValue(id, "_previewUrl", inputFileUrl(filename));
      updateWidgetValue(id, "_comfyFilename", filename);
      setUploadStatus("uploaded");
    } catch (err) {
      console.warn("[Import] background upload failed:", err);
      setUploadStatus("failed");
    }
  }, [id, updateWidgetValue]);

  const handleFile = useCallback((file: File) => {
    const { type, url } = processImportFile(file, {
      setValue: (key, value) => updateWidgetValue(id, key, value),
    });
    setMediaType(type);
    setFileName(file.name);
    setPreview(url);
    // Invalidate any previous server URL — content has changed.
    updateWidgetValue(id, "_previewUrl", "");
    updateWidgetValue(id, "_comfyFilename", "");
    void uploadInBackground(url, file.name);
  }, [id, updateWidgetValue, uploadInBackground]);

  const clearFile = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (preview) URL.revokeObjectURL(preview);
    setMediaType("none");
    setPreview(null);
    setFileName("");
    setUploadStatus("idle");
    updateWidgetValue(id, "_mediaType", "none");
    updateWidgetValue(id, "_fileName", "");
    updateWidgetValue(id, "_preview", null);
    updateWidgetValue(id, "_previewUrl", "");
    updateWidgetValue(id, "_comfyFilename", "");
    updateWidgetValue(id, "_fileInfo", {});
  }, [id, preview, updateWidgetValue]);

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
    updateWidgetValue(id, "_previewUrl", "");
    updateWidgetValue(id, "_comfyFilename", "");
    updateWidgetValue(id, "_fileInfo", { source: "media-library" });
    const dot = fileName.lastIndexOf(".");
    const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase()
      : (mt === "audio" ? "wav" : mt === "video" ? "mp4" : "png");
    void uploadInBackground(url, `dropped.${ext}`);
  }, [id, updateWidgetValue, uploadInBackground]);

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
            <span className="import-status">
              {mediaType === "none" ? "IDLE" : actualType}
              {uploadStatus === "uploading" && " · uploading…"}
              {uploadStatus === "failed" && " · upload failed"}
            </span>
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
          <div className="import-audio-wrap" onClick={(e) => e.stopPropagation()}>
            <WaveformPlayer url={preview} />
          </div>
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

export default memo(ImportNode);
