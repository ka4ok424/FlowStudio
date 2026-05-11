import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { dataUrlToBlobUrl } from "../utils/blobUrl";
import { getConnectedImageUrl } from "../hooks/useNodeHelpers";
import MultiCropEditor, { type CellRect } from "../components/MultiCropEditor";

const IMAGE_COLOR = "#64b5f6";

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

function MultiCropNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const srcUrl = getConnectedImageUrl(id, "input", nodesAll as any[], edgesAll as any[]);
  // sourceNodeId is the stable identity of the upstream node (survives reload,
  // unlike its blob: URL which is recreated with a new uuid each session).
  const srcEdge = edgesAll.find((e) => e.target === id && e.targetHandle === "input");
  const sourceNodeId = srcEdge?.source ?? null;

  const wv = nodeData.widgetValues || {};
  // Key kept as `_detectedCells` for back-compat (downstream extraction reads it).
  const cells: CellRect[] = wv._detectedCells || [];
  const cellPreviews: Record<string, string> = wv._cellPreviews || {};

  const [srcDim, setSrcDim] = useState<{ w: number; h: number } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastExtractedRef = useRef<string | null>(null);
  const runStateRef = useRef<{
    running: boolean;
    pending: { url: string; cells: CellRect[] } | null;
  }>({ running: false, pending: null });

  // Load source dims on source change. Reset cells / previews only when the
  // user CONNECTS A DIFFERENT UPSTREAM NODE — not when the same node just
  // happens to have a fresh blob: URL after a page reload (which would erase
  // the user's hand-drawn cells on every refresh).
  useEffect(() => {
    if (!srcUrl) { setSrcDim(null); return; }
    let cancelled = false;
    setError(null);
    loadImage(srcUrl).then((img) => {
      if (cancelled) return;
      setSrcDim({ w: img.naturalWidth, h: img.naturalHeight });
      const wv0 = nodeData.widgetValues || {};
      if (wv0._lastSourceNodeId !== sourceNodeId) {
        updateWidgetValue(id, "_lastSourceNodeId", sourceNodeId);
        updateWidgetValue(id, "_cellPreviews", {});
        updateWidgetValue(id, "_detectedCells", []);
        lastExtractedRef.current = null;
      } else {
        // Same upstream node — force re-extraction of cell previews so blob
        // URLs from the previous session are refreshed against the live image.
        lastExtractedRef.current = null;
      }
    }).catch((err) => { if (!cancelled) setError(err.message || "Load failed"); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcUrl, sourceNodeId, id]);

  // Extract per-cell PNGs whenever cells change. Lock + coalesce.
  useEffect(() => {
    if (!srcUrl || cells.length === 0) {
      // If user cleared the cells, clear previews too so downstream nodes see emptiness.
      if (srcUrl && cells.length === 0 && Object.keys(cellPreviews).length > 0) {
        updateWidgetValue(id, "_cellPreviews", {});
        updateWidgetValue(id, "_previewUrl", null);
        lastExtractedRef.current = null;
      }
      return;
    }
    const key = `${srcUrl}|${JSON.stringify(cells)}`;
    if (lastExtractedRef.current === key) return;

    runStateRef.current.pending = { url: srcUrl, cells };
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
  }, [srcUrl, cells, id, updateWidgetValue]);

  const onEditorChange = useCallback((next: CellRect[]) => {
    updateWidgetValue(id, "_detectedCells", next);
  }, [id, updateWidgetValue]);

  // Highlights
  const inHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const outHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const dimClass = connectingType ? ((inHL || outHL) ? "compatible" : "incompatible") : "";

  const totalCells = cells.length;

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
                : extracting ? "CROPPING…"
                : totalCells === 0 ? "NO CELLS"
                : `${totalCells} ${totalCells === 1 ? "cell" : "cells"}`}
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
          <div className="multicrop-preview">
            <img src={srcUrl} alt="" className="multicrop-img" draggable={false} crossOrigin="anonymous" />
            {cells.map((cell, i) => {
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
          <button
            className="multicrop-detect-btn"
            onClick={() => setEditorOpen(true)}
            disabled={!srcUrl}
          >
            ✎ Open editor{totalCells > 0 ? ` · ${totalCells}` : ""}
          </button>
        </div>
      )}

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="multicrop-outputs">
        <div className="multicrop-outputs-label">Outputs ({totalCells})</div>
        {cells.length === 0 ? (
          <div className="multicrop-outputs-empty">Open the editor to draw cells</div>
        ) : (
          cells.map((_, i) => {
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

      {editorOpen && srcUrl && srcDim && (
        <MultiCropEditor
          srcUrl={srcUrl}
          srcDim={srcDim}
          initialCells={cells}
          onChange={onEditorChange}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}

export default memo(MultiCropNode);
