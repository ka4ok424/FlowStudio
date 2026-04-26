import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { dataUrlToBlobUrl } from "../utils/blobUrl";
import { getConnectedImageUrl } from "../hooks/useNodeHelpers";

const IMAGE_COLOR = "#64b5f6";

interface CellRect { x: number; y: number; w: number; h: number }

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  return await new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}

async function cropCell(srcUrl: string, c: CellRect): Promise<string> {
  const img = await loadImage(srcUrl);
  const w = Math.max(1, Math.round(c.w));
  const h = Math.max(1, Math.round(c.h));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.drawImage(img, c.x, c.y, c.w, c.h, 0, 0, w, h);
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  return dataUrlToBlobUrl(dataUrl);
}

/**
 * Detect image regions in a source picture via connected-components on the
 * background-thresholded version of the image. Designed for storyboards /
 * contact sheets / collages where images are separated by a uniform-color
 * background (white, black, beige, etc).
 *
 * Pipeline:
 *   1. Sample background color from the edges (40 points across borders).
 *   2. Threshold every pixel by RGB distance to background → content mask.
 *   3. BFS connected components on the content mask.
 *   4. Filter components by min area, fill ratio, aspect ratio.
 *   5. Sort top-to-bottom, left-to-right with row tolerance.
 *
 * Returns each component's bounding rect in SOURCE-image pixel coords.
 */
async function detectImageCells(srcUrl: string): Promise<CellRect[]> {
  const img = await loadImage(srcUrl);
  // Downscale for speed (4K = 16M pixels = slow). Cap at 600px on the long edge.
  const maxDim = 600;
  const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longEdge > maxDim ? maxDim / longEdge : 1;
  const aw = Math.max(1, Math.round(img.naturalWidth * scale));
  const ah = Math.max(1, Math.round(img.naturalHeight * scale));
  const sx = img.naturalWidth / aw;
  const sy = img.naturalHeight / ah;

  const canvas = document.createElement("canvas");
  canvas.width = aw; canvas.height = ah;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.drawImage(img, 0, 0, aw, ah);
  const data = ctx.getImageData(0, 0, aw, ah).data;

  // 1. Background color via edge sampling (median of corners + edge midpoints)
  const samples: number[][] = [];
  const N = 10;
  for (let i = 0; i < N; i++) {
    const t = Math.round((i / (N - 1)) * (aw - 1));
    samples.push([t, 0], [t, ah - 1]);
    const u = Math.round((i / (N - 1)) * (ah - 1));
    samples.push([0, u], [aw - 1, u]);
  }
  let bgR = 0, bgG = 0, bgB = 0;
  for (const [x, y] of samples) {
    const i = (y * aw + x) * 4;
    bgR += data[i]; bgG += data[i + 1]; bgB += data[i + 2];
  }
  bgR /= samples.length; bgG /= samples.length; bgB /= samples.length;

  // 2. Threshold each pixel
  const tolerance = 35; // RGB distance (0..441)
  const isContent = new Uint8Array(aw * ah);
  for (let i = 0; i < aw * ah; i++) {
    const idx = i * 4;
    const dr = data[idx] - bgR;
    const dg = data[idx + 1] - bgG;
    const db = data[idx + 2] - bgB;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    isContent[i] = dist > tolerance ? 1 : 0;
  }

  // 3. Connected components — iterative DFS with explicit stack (avoid recursion
  // overflow on large blobs).
  const labels = new Int32Array(aw * ah);
  let nextLabel = 1;
  interface Box { minX: number; minY: number; maxX: number; maxY: number; size: number }
  const labelBoxes = new Map<number, Box>();

  for (let y0 = 0; y0 < ah; y0++) {
    for (let x0 = 0; x0 < aw; x0++) {
      const i0 = y0 * aw + x0;
      if (!isContent[i0] || labels[i0]) continue;

      const label = nextLabel++;
      let minX = x0, maxX = x0, minY = y0, maxY = y0, size = 0;
      const stack: number[] = [i0];
      labels[i0] = label;
      while (stack.length > 0) {
        const j = stack.pop() as number;
        size++;
        const jx = j % aw;
        const jy = (j - jx) / aw;
        if (jx < minX) minX = jx;
        if (jx > maxX) maxX = jx;
        if (jy < minY) minY = jy;
        if (jy > maxY) maxY = jy;
        if (jx > 0     && isContent[j - 1]  && !labels[j - 1])  { labels[j - 1]  = label; stack.push(j - 1); }
        if (jx < aw-1  && isContent[j + 1]  && !labels[j + 1])  { labels[j + 1]  = label; stack.push(j + 1); }
        if (jy > 0     && isContent[j - aw] && !labels[j - aw]) { labels[j - aw] = label; stack.push(j - aw); }
        if (jy < ah-1  && isContent[j + aw] && !labels[j + aw]) { labels[j + aw] = label; stack.push(j + aw); }
      }
      labelBoxes.set(label, { minX, minY, maxX, maxY, size });
    }
  }

  // 4. Filter components
  const totalArea = aw * ah;
  const minArea = totalArea * 0.005;   // 0.5% of source area
  const candidates: CellRect[] = [];
  for (const [, box] of labelBoxes) {
    if (box.size < minArea) continue;
    const w = box.maxX - box.minX + 1;
    const h = box.maxY - box.minY + 1;
    const fill = box.size / (w * h);
    if (fill < 0.3) continue;          // too sparse → text/noise
    const ar = w / h;
    if (ar > 12 || ar < 1 / 12) continue; // too elongated → text bar / divider line
    candidates.push({
      x: Math.round(box.minX * sx),
      y: Math.round(box.minY * sy),
      w: Math.round(w * sx),
      h: Math.round(h * sy),
    });
  }

  // 5. Sort top-to-bottom, left-to-right with row tolerance
  candidates.sort((a, b) => {
    const tol = Math.min(a.h, b.h) * 0.5;
    if (Math.abs(a.y - b.y) < tol) return a.x - b.x;
    return a.y - b.y;
  });

  return candidates;
}

function MultiCropNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const srcUrl = getConnectedImageUrl(id, "input", nodesAll as any[], edgesAll as any[]);

  const wv = nodeData.widgetValues || {};
  const detectedCells: CellRect[] = wv._detectedCells || [];
  const cellPreviews: Record<string, string> = wv._cellPreviews || {};
  const autoDetectOnConnect: boolean = wv.autoDetectOnConnect ?? true;

  const [srcDim, setSrcDim] = useState<{ w: number; h: number } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastExtractedRef = useRef<string | null>(null);
  const runStateRef = useRef<{
    running: boolean;
    pending: { url: string; cells: CellRect[] } | null;
  }>({ running: false, pending: null });

  // Run detection (manual or auto)
  const runDetect = useCallback(async () => {
    if (!srcUrl) return;
    setDetecting(true);
    setError(null);
    try {
      const cells = await detectImageCells(srcUrl);
      updateWidgetValue(id, "_detectedCells", cells);
      if (cells.length === 0) setError("No images detected — try manual cells or check source");
    } catch (err: any) {
      setError(err?.message || "Detect failed");
    } finally {
      setDetecting(false);
    }
  }, [srcUrl, id, updateWidgetValue]);

  // Load source dims + auto-detect on source change
  useEffect(() => {
    if (!srcUrl) { setSrcDim(null); return; }
    let cancelled = false;
    setError(null);
    loadImage(srcUrl).then((img) => {
      if (cancelled) return;
      setSrcDim({ w: img.naturalWidth, h: img.naturalHeight });
      if (nodeData.widgetValues?._lastSourceUrl !== srcUrl) {
        updateWidgetValue(id, "_lastSourceUrl", srcUrl);
        updateWidgetValue(id, "_cellPreviews", {});
        updateWidgetValue(id, "_detectedCells", []);
        lastExtractedRef.current = null;
        if (autoDetectOnConnect) {
          // schedule detect in next tick so widgetValues updates first
          setTimeout(() => runDetect(), 0);
        }
      }
    }).catch((err) => { if (!cancelled) setError(err.message || "Load failed"); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcUrl, id]);

  // Extract per-cell PNGs whenever detectedCells changes. Lock + coalesce.
  useEffect(() => {
    if (!srcUrl || detectedCells.length === 0) return;
    const key = `${srcUrl}|${JSON.stringify(detectedCells)}`;
    if (lastExtractedRef.current === key) return;

    runStateRef.current.pending = { url: srcUrl, cells: detectedCells };
    if (runStateRef.current.running) return;
    runStateRef.current.running = true;
    setExtracting(true);
    setError(null);

    (async () => {
      try {
        while (runStateRef.current.pending) {
          const target = runStateRef.current.pending;
          runStateRef.current.pending = null;

          const out: Record<string, string> = {};
          for (let i = 0; i < target.cells.length; i++) {
            const handleId = `out_${i + 1}`;
            out[handleId] = await cropCell(target.url, target.cells[i]);
          }

          const next = runStateRef.current.pending;
          if (next && next.url !== target.url) continue;

          updateWidgetValue(id, "_cellPreviews", out);
          updateWidgetValue(id, "_previewUrl", out["out_1"] || null);
          lastExtractedRef.current = key;
        }
      } catch (err: any) {
        setError(err?.message || "Crop failed");
      } finally {
        runStateRef.current.running = false;
        setExtracting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcUrl, detectedCells, id, updateWidgetValue]);

  // Highlights
  const inHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const outHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const dimClass = connectingType ? ((inHL || outHL) ? "compatible" : "incompatible") : "";

  const totalCells = detectedCells.length;

  return (
    <div className={`multicrop-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="multicrop-node-inner">
        <div className="multicrop-accent" />
        <div className="multicrop-header">
          <span className="multicrop-icon">▦</span>
          <div className="multicrop-header-text">
            <span className="multicrop-title">Multi Crop</span>
            <span className="multicrop-status">
              {!srcUrl ? "NO INPUT"
                : error ? "ERROR"
                : detecting ? "DETECTING…"
                : extracting ? "CROPPING…"
                : totalCells === 0 ? "NO CELLS"
                : `${totalCells} cells detected`}
            </span>
          </div>
        </div>
      </div>

      <div className="multicrop-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="input" className={`slot-handle ${inHL}`} style={{ color: IMAGE_COLOR }} />
          <span className="type-badge" style={{ color: IMAGE_COLOR, borderColor: IMAGE_COLOR + "66", backgroundColor: IMAGE_COLOR + "12" }}>IMAGE</span>
          <span className="nanob-input-label">Image</span>
        </div>
      </div>

      <div className="multicrop-preview-wrap nodrag" onClick={(e) => e.stopPropagation()}>
        {srcUrl && srcDim ? (
          <div className="multicrop-preview" style={{ aspectRatio: `${srcDim.w} / ${srcDim.h}`, maxHeight: 540 }}>
            <img src={srcUrl} alt="" className="multicrop-img" draggable={false} crossOrigin="anonymous" />
            {/* Detected cell bounding boxes */}
            {detectedCells.map((cell, i) => {
              const left = `${(cell.x / srcDim.w) * 100}%`;
              const top = `${(cell.y / srcDim.h) * 100}%`;
              const width = `${(cell.w / srcDim.w) * 100}%`;
              const height = `${(cell.h / srcDim.h) * 100}%`;
              return (
                <div key={i} className="multicrop-detected-rect" style={{ left, top, width, height }}>
                  <span className="multicrop-cell-num">{i + 1}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="multicrop-placeholder">
            <span className="multicrop-placeholder-icon">▦</span>
            <span className="multicrop-placeholder-text">{srcUrl ? "Loading…" : "Connect an IMAGE input"}</span>
          </div>
        )}
      </div>

      {srcDim && (
        <div className="multicrop-controls nodrag" onClick={(e) => e.stopPropagation()}>
          <button className="multicrop-detect-btn" onClick={runDetect} disabled={detecting || !srcUrl}>
            {detecting ? "Detecting…" : "🎯 Detect images"}
          </button>
        </div>
      )}

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="multicrop-outputs">
        <div className="multicrop-outputs-label">Outputs ({totalCells})</div>
        {detectedCells.length === 0 ? (
          <div className="multicrop-outputs-empty">Click 🎯 Detect to find image cells</div>
        ) : (
          detectedCells.map((_, i) => {
            const handleId = `out_${i + 1}`;
            const hasPreview = !!cellPreviews[handleId];
            return (
              <div key={handleId} className="multicrop-output-row">
                <span className="multicrop-output-label">Cell {i + 1}</span>
                <span
                  className="type-badge"
                  style={{
                    color: IMAGE_COLOR,
                    borderColor: IMAGE_COLOR + "66",
                    backgroundColor: IMAGE_COLOR + "12",
                    opacity: hasPreview ? 1 : 0.5,
                  }}
                >IMG</span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={handleId}
                  className={`slot-handle ${outHL}`}
                  style={{ color: IMAGE_COLOR, opacity: hasPreview ? 1 : 0.4 }}
                  title={`Cell ${i + 1}`}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default memo(MultiCropNode);
