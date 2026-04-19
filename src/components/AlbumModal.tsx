import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { loadImage } from "../store/imageDb";

interface Props {
  open: boolean;
  history: string[];           // markers: data URL or "__idb__:key"
  currentIndex: number;
  onPick: (idx: number) => void;
  onClose: () => void;
  mediaType?: "image" | "video" | "audio";
}

const cache = new Map<string, string>();

async function resolve(marker: string): Promise<string | null> {
  if (!marker) return null;
  if (cache.has(marker)) return cache.get(marker)!;
  if (marker.startsWith("__idb__:")) {
    const data = await loadImage(marker.replace("__idb__:", ""));
    if (data) { cache.set(marker, data); return data; }
    return null;
  }
  cache.set(marker, marker);
  return marker;
}

/**
 * Album modal: grid view of every entry in a node's _history array.
 * Click a tile → calls onPick(idx) and closes. Escape closes.
 */
export default function AlbumModal({ open, history, currentIndex, onPick, onClose, mediaType = "image" }: Props) {
  const [urls, setUrls] = useState<(string | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all(history.map(resolve)).then((res) => {
      if (!cancelled) setUrls(res);
    });
    return () => { cancelled = true; };
  }, [open, history]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.75)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(1200px, 100%)",
          maxHeight: "92vh",
          background: "#15151d",
          border: "1px solid #2a2a35",
          borderRadius: 10,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid #2a2a35",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>
            Album · {history.length} {history.length === 1 ? "entry" : "entries"}
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", color: "#888",
            fontSize: 20, cursor: "pointer", padding: "0 6px",
          }}>✕</button>
        </div>

        <div style={{
          padding: 16,
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 10,
        }}>
          {urls.map((url, i) => (
            <div
              key={i}
              onClick={() => { onPick(i); onClose(); }}
              style={{
                aspectRatio: "1 / 1",
                background: "#0d0d14",
                border: i === currentIndex ? "2px solid #3b82f6" : "1px solid #2a2a35",
                borderRadius: 6,
                overflow: "hidden",
                cursor: "pointer",
                position: "relative",
                transition: "transform 0.1s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.02)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
            >
              {url ? (
                mediaType === "video" ? (
                  <video src={url} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <img src={url} alt={`#${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} draggable={false} />
                )
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#444" }}>…</div>
              )}
              <div style={{
                position: "absolute", bottom: 4, left: 4,
                background: "rgba(0,0,0,0.7)", color: "#fff",
                fontSize: 10, padding: "2px 6px", borderRadius: 3,
              }}>#{i + 1}{i === currentIndex ? " · active" : ""}</div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
