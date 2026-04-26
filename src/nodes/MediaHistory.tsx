import { useCallback, useState, useRef, useEffect } from "react";
import { useWorkflowStore } from "../store/workflowStore";
import { saveImage, loadImage } from "../store/imageDb";
import { dataUrlToBlobUrl } from "../utils/blobUrl";
import { makeDragGhost, findGhostSource } from "../utils/dragGhost";
import AlbumModal from "../components/AlbumModal";

interface MediaHistoryProps {
  nodeId: string;
  history: string[];
  historyIndex: number;
  fallbackUrl: string | null;
  emptyIcon: string;
  mediaType?: "image" | "video" | "audio";
  genTime?: number | null;
}

export default function MediaHistory({ nodeId, history, historyIndex, fallbackUrl, emptyIcon, mediaType = "image", genTime }: MediaHistoryProps) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [albumOpen, setAlbumOpen] = useState(false);

  const total = history.length;
  const currentIndex = total > 0 ? Math.max(0, Math.min(historyIndex, total - 1)) : -1;

  // Only show current preview URL (from _previewUrl), don't render all history
  const currentUrl = fallbackUrl;

  const loadHistoryItem = useCallback((idx: number) => {
    const marker = history[idx];
    updateWidgetValue(nodeId, "_historyIndex", idx);
    if (marker && marker.startsWith("__idb__:")) {
      const idbKey = marker.replace("__idb__:", "");
      loadImage(idbKey).then((data) => {
        if (data) {
          // Convert to blob URL — keeps image out of JS heap
          const url = data.startsWith("data:") ? dataUrlToBlobUrl(data) : data;
          updateWidgetValue(nodeId, "_previewUrl", url);
        }
      });
    } else if (marker) {
      updateWidgetValue(nodeId, "_previewUrl", marker);
    }
  }, [nodeId, history, updateWidgetValue]);

  // Page-reload fix: blob: URLs from previous browser session are DEAD (gone with
  // memory). _previewUrl persists in widgetValues but points to a stale blob.
  // On first mount, if URL is blob: AND history exists, re-resolve from history
  // to get a fresh blob URL backed by IndexedDB. Without this, video/image
  // preview stays broken until user navigates history (← then →).
  const didReloadFixRef = useRef(false);
  useEffect(() => {
    if (didReloadFixRef.current) return;
    didReloadFixRef.current = true;
    if (currentUrl?.startsWith("blob:") && currentIndex >= 0 && history[currentIndex]) {
      loadHistoryItem(currentIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goPrev = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentIndex > 0) loadHistoryItem(currentIndex - 1);
  }, [currentIndex, loadHistoryItem]);

  const goNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentIndex < total - 1) loadHistoryItem(currentIndex + 1);
  }, [currentIndex, total, loadHistoryItem]);

  const onDragStart = useCallback((e: React.DragEvent) => {
    if (!currentUrl) return;
    // GEOMETRIC check: dragstart fires on the wrapper (e.target = DIV always),
    // but e.clientX/Y is the real pointer position. If pointer is inside the
    // bounding rect of the inner <video>/<audio>, cancel — let native controls
    // (timeline scrubber, volume) handle the drag instead of HTML5 DnD hijacking.
    if (wrapRef.current) {
      const mediaEl = wrapRef.current.querySelector("video, audio") as HTMLElement | null;
      if (mediaEl) {
        const r = mediaEl.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right
            && e.clientY >= r.top && e.clientY <= r.bottom) {
          e.preventDefault();
          return;
        }
      }
    }
    e.stopPropagation();
    const ext = mediaType === "video" ? "mp4" : mediaType === "audio" ? "wav" : "png";
    e.dataTransfer.setData("application/flowstudio-media", JSON.stringify({
      url: currentUrl,
      fileName: `flowstudio_${mediaType}_${Date.now()}.${ext}`,
      type: mediaType,
    }));
    e.dataTransfer.effectAllowed = "copy";
    // Fixed-size ghost: zoom-independent, not the full-resolution image.
    const src = findGhostSource(e.currentTarget as HTMLElement);
    if (src) {
      const ghost = makeDragGhost(src, 120);
      e.dataTransfer.setDragImage(ghost, ghost.width / 2, ghost.height / 2);
    }
  }, [currentUrl, mediaType]);

  return (
    <div
      ref={wrapRef}
      className={`nanob-preview ${currentUrl ? "nodrag" : ""}`}
      draggable={!!currentUrl}
      onDragStart={onDragStart}
    >
      {currentUrl ? (
        <>
          {mediaType === "video" ? (
            // preload="metadata" + reserved min-height avoids the "thin semi-transparent
            // strip" bug on page reload where intrinsic height is 0 before the ComfyUI
            // API responds with video metadata.
            <video
              src={currentUrl}
              className="nanob-preview-img"
              controls
              muted
              loop
              preload="metadata"
              style={{ width: "100%", minHeight: 160, objectFit: "contain", background: "#000", borderRadius: "inherit" }}
            />
          ) : mediaType === "audio" ? (
            <audio src={currentUrl} controls style={{ width: "100%", padding: "8px" }} />
          ) : (
            <img src={currentUrl} alt="Generated" className="nanob-preview-img" draggable={false} />
          )}
          {total > 1 && (
            <div className="img-history-nav">
              <button
                className="img-history-btn"
                onClick={goPrev}
                disabled={currentIndex <= 0}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                className="img-history-btn"
                onClick={(e) => { e.stopPropagation(); setAlbumOpen(true); }}
                title="Open album"
                style={{ padding: "0 6px" }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
              </button>
              <span className="img-history-counter">{currentIndex + 1} / {total}</span>
              <button
                className="img-history-btn"
                onClick={goNext}
                disabled={currentIndex >= total - 1}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          )}
          {/* Generation time */}
          {genTime != null && genTime > 0 && (
            <span className="media-gen-time">{genTime < 1000 ? `${genTime}ms` : `${(genTime / 1000).toFixed(1)}s`}</span>
          )}
          {/* Download button */}
          <button className="media-history-download" onClick={(e) => {
            e.stopPropagation();
            const ext = mediaType === "video" ? "mp4" : mediaType === "audio" ? "wav" : "png";
            const a = document.createElement("a");
            a.href = currentUrl;
            a.download = `flowstudio_${mediaType}_${Date.now()}.${ext}`;
            a.click();
          }} title="Download">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        </>
      ) : (
        <div className="nanob-preview-empty">
          <span className="nanob-preview-logo">{emptyIcon}</span>
        </div>
      )}
      <AlbumModal
        open={albumOpen}
        history={history}
        currentIndex={currentIndex}
        mediaType={mediaType}
        onPick={(idx) => loadHistoryItem(idx)}
        onClose={() => setAlbumOpen(false)}
      />
    </div>
  );
}
