import { useCallback, useState, useEffect } from "react";
import { useWorkflowStore } from "../store/workflowStore";
import { saveImage, loadImage } from "../store/imageDb";

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

  const total = history.length;
  const currentIndex = total > 0 ? Math.max(0, Math.min(historyIndex, total - 1)) : -1;

  // Only show current preview URL (from _previewUrl), don't render all history
  const currentUrl = fallbackUrl;

  const loadHistoryItem = useCallback((idx: number) => {
    const marker = history[idx];
    updateWidgetValue(nodeId, "_historyIndex", idx);
    if (marker && marker.startsWith("__idb__:")) {
      // Extract IDB key from marker
      const idbKey = marker.replace("__idb__:", "");
      loadImage(idbKey).then((data) => {
        if (data) updateWidgetValue(nodeId, "_previewUrl", data);
      });
    } else if (marker) {
      updateWidgetValue(nodeId, "_previewUrl", marker);
    }
  }, [nodeId, history, updateWidgetValue]);

  const goPrev = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentIndex > 0) loadHistoryItem(currentIndex - 1);
  }, [currentIndex, loadHistoryItem]);

  const goNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentIndex < total - 1) loadHistoryItem(currentIndex + 1);
  }, [currentIndex, total, loadHistoryItem]);

  return (
    <div className="nanob-preview">
      {currentUrl ? (
        <>
          {mediaType === "video" ? (
            <video src={currentUrl} className="nanob-preview-img" controls muted loop style={{ width: "100%", height: "auto" }} />
          ) : mediaType === "audio" ? (
            <audio src={currentUrl} controls style={{ width: "100%", padding: "8px" }} />
          ) : (
            <img src={currentUrl} alt="Generated" className="nanob-preview-img" />
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
    </div>
  );
}
