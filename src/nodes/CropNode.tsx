import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { dataUrlToBlobUrl } from "../utils/blobUrl";
import { getConnectedImageUrl } from "../hooks/useNodeHelpers";

const IMAGE_COLOR = "#64b5f6";

type AspectKey = "custom" | "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "manual";
const ASPECT_RATIOS: Record<Exclude<AspectKey, "custom" | "manual">, number> = {
  "1:1": 1, "16:9": 16 / 9, "9:16": 9 / 16, "4:3": 4 / 3, "3:4": 3 / 4,
};

interface Crop { x: number; y: number; w: number; h: number }

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  return await new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}

async function cropImage(srcUrl: string, c: Crop): Promise<{ dataUrl: string; w: number; h: number }> {
  const img = await loadImage(srcUrl);
  const w = Math.max(1, Math.round(c.w));
  const h = Math.max(1, Math.round(c.h));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
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
  return { dataUrl, w, h };
}

function CropNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  // Upstream image URL
  const srcUrl = getConnectedImageUrl(id, "input", nodesAll as any[], edgesAll as any[]);

  // Persistent state
  const aspect: AspectKey = nodeData.widgetValues?.aspect ?? "custom";
  const manualW: number = nodeData.widgetValues?.manualW ?? 1;
  const manualH: number = nodeData.widgetValues?.manualH ?? 1;
  const cropX: number = nodeData.widgetValues?.cropX ?? 0;
  const cropY: number = nodeData.widgetValues?.cropY ?? 0;
  const cropW: number = nodeData.widgetValues?.cropW ?? 0;
  const cropH: number = nodeData.widgetValues?.cropH ?? 0;
  const previewUrl: string | null = nodeData.widgetValues?._previewUrl || null;

  // Source image dimensions (loaded async on src change)
  const [srcDim, setSrcDim] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [dragging, setDragging] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const lastExtractedRef = useRef<{ url: string; key: string } | null>(null);
  const runStateRef = useRef<{
    running: boolean;
    pending: { url: string; crop: Crop } | null;
  }>({ running: false, pending: null });

  // Resolve effective aspect ratio (number) — null = free
  const lockedRatio: number | null = (() => {
    if (aspect === "custom") return null;
    if (aspect === "manual") return manualW > 0 && manualH > 0 ? manualW / manualH : null;
    return ASPECT_RATIOS[aspect];
  })();

  // Load source image, capture dimensions, init full-image crop on first load
  useEffect(() => {
    if (!srcUrl) { setSrcDim(null); return; }
    let cancelled = false;
    setError(null);
    loadImage(srcUrl).then((img) => {
      if (cancelled) return;
      setSrcDim({ w: img.naturalWidth, h: img.naturalHeight });
      // Reset crop to full image when source changes
      const lastSrc = nodeData.widgetValues?._lastSourceUrl;
      if (lastSrc !== srcUrl) {
        updateWidgetValue(id, "_lastSourceUrl", srcUrl);
        updateWidgetValue(id, "cropX", 0);
        updateWidgetValue(id, "cropY", 0);
        updateWidgetValue(id, "cropW", img.naturalWidth);
        updateWidgetValue(id, "cropH", img.naturalHeight);
        lastExtractedRef.current = null;
      }
    }).catch((err) => {
      if (!cancelled) setError(err.message || "Load failed");
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcUrl, id]);

  const effectiveCrop: Crop = (() => {
    if (cropW > 0 && cropH > 0) return { x: cropX, y: cropY, w: cropW, h: cropH };
    if (srcDim) return { x: 0, y: 0, w: srcDim.w, h: srcDim.h };
    return { x: 0, y: 0, w: 0, h: 0 };
  })();

  // Crop runner — same lock+coalesce as Frame Extract
  useEffect(() => {
    if (dragging) return;
    if (!srcUrl || !srcDim || effectiveCrop.w <= 0 || effectiveCrop.h <= 0) return;
    const key = `${effectiveCrop.x}|${effectiveCrop.y}|${effectiveCrop.w}|${effectiveCrop.h}`;
    if (lastExtractedRef.current?.url === srcUrl && lastExtractedRef.current?.key === key) return;

    runStateRef.current.pending = { url: srcUrl, crop: { ...effectiveCrop } };
    if (runStateRef.current.running) return;
    runStateRef.current.running = true;
    setExtracting(true);
    setError(null);

    (async () => {
      try {
        while (runStateRef.current.pending) {
          const target = runStateRef.current.pending;
          runStateRef.current.pending = null;
          const tKey = `${target.crop.x}|${target.crop.y}|${target.crop.w}|${target.crop.h}`;
          const lp = lastExtractedRef.current;
          if (lp && lp.url === target.url && lp.key === tKey) continue;

          const { dataUrl, w, h } = await cropImage(target.url, target.crop);
          // If source URL changed during crop → discard
          const next = runStateRef.current.pending;
          if (next && next.url !== target.url) continue;
          updateWidgetValue(id, "_previewUrl", dataUrlToBlobUrl(dataUrl));
          updateWidgetValue(id, "_extractedSize", `${w} × ${h}`);
          lastExtractedRef.current = { url: target.url, key: tKey };
        }
      } catch (err: any) {
        setError(err?.message || "Crop failed");
      } finally {
        runStateRef.current.running = false;
        setExtracting(false);
      }
    })();
  }, [srcUrl, srcDim, effectiveCrop.x, effectiveCrop.y, effectiveCrop.w, effectiveCrop.h, dragging, id, updateWidgetValue]);

  // ── Drag interactions ──────────────────────────────────────────────
  type DragMode = "move" | "nw" | "ne" | "sw" | "se";
  const dragRef = useRef<{
    mode: DragMode;
    startMouseX: number; startMouseY: number;
    startCrop: Crop;
    scale: number; // displayPx → sourcePx
  } | null>(null);

  const onPointerDownOverlay = useCallback((mode: DragMode) => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!previewRef.current || !srcDim) return;
    const rect = previewRef.current.getBoundingClientRect();
    const scale = srcDim.w / rect.width;
    dragRef.current = {
      mode,
      startMouseX: e.clientX, startMouseY: e.clientY,
      startCrop: { ...effectiveCrop },
      scale,
    };
    setDragging(true);

    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (ev.clientX - d.startMouseX) * d.scale;
      const dy = (ev.clientY - d.startMouseY) * d.scale;
      let nx = d.startCrop.x, ny = d.startCrop.y, nw = d.startCrop.w, nh = d.startCrop.h;

      if (d.mode === "move") {
        nx = Math.max(0, Math.min(srcDim.w - d.startCrop.w, d.startCrop.x + dx));
        ny = Math.max(0, Math.min(srcDim.h - d.startCrop.h, d.startCrop.y + dy));
      } else {
        // Resize from corner — anchor = opposite corner
        let ax = 0, ay = 0; // anchor (stays fixed)
        if (d.mode === "nw") { ax = d.startCrop.x + d.startCrop.w; ay = d.startCrop.y + d.startCrop.h; }
        if (d.mode === "ne") { ax = d.startCrop.x;                 ay = d.startCrop.y + d.startCrop.h; }
        if (d.mode === "sw") { ax = d.startCrop.x + d.startCrop.w; ay = d.startCrop.y; }
        if (d.mode === "se") { ax = d.startCrop.x;                 ay = d.startCrop.y; }
        let mx = (d.mode === "nw" || d.mode === "sw") ? d.startCrop.x + dx : d.startCrop.x + d.startCrop.w + dx;
        let my = (d.mode === "nw" || d.mode === "ne") ? d.startCrop.y + dy : d.startCrop.y + d.startCrop.h + dy;
        // Clamp to canvas
        mx = Math.max(0, Math.min(srcDim.w, mx));
        my = Math.max(0, Math.min(srcDim.h, my));

        let cw = Math.max(8, Math.abs(mx - ax));
        let ch = Math.max(8, Math.abs(my - ay));

        if (lockedRatio) {
          // Maintain ratio — let the larger delta win
          const wByH = ch * lockedRatio;
          const hByW = cw / lockedRatio;
          if (wByH > cw) ch = hByW; else cw = wByH;
          // Re-clamp so we don't exceed source bounds
          const maxW = (mx >= ax) ? srcDim.w - ax : ax;
          const maxH = (my >= ay) ? srcDim.h - ay : ay;
          if (cw > maxW) { cw = maxW; ch = cw / lockedRatio; }
          if (ch > maxH) { ch = maxH; cw = ch * lockedRatio; }
        }

        nx = (mx >= ax) ? ax : ax - cw;
        ny = (my >= ay) ? ay : ay - ch;
        nw = cw; nh = ch;
      }
      updateWidgetValue(id, "cropX", Math.round(nx));
      updateWidgetValue(id, "cropY", Math.round(ny));
      updateWidgetValue(id, "cropW", Math.round(nw));
      updateWidgetValue(id, "cropH", Math.round(nh));
    };
    const onUp = () => {
      dragRef.current = null;
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, [effectiveCrop, srcDim, lockedRatio, id, updateWidgetValue]);

  const onAspectChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    const next = e.target.value as AspectKey;
    updateWidgetValue(id, "aspect", next);
    // If switching to a locked ratio, snap current crop to that ratio while keeping its center & area
    if (next !== "custom" && srcDim && cropW > 0 && cropH > 0) {
      const r = next === "manual"
        ? (manualW > 0 && manualH > 0 ? manualW / manualH : null)
        : ASPECT_RATIOS[next];
      if (r) {
        const cx = cropX + cropW / 2;
        const cy = cropY + cropH / 2;
        const area = cropW * cropH;
        let nh = Math.sqrt(area / r);
        let nw = nh * r;
        // Clamp to source
        if (nw > srcDim.w) { nw = srcDim.w; nh = nw / r; }
        if (nh > srcDim.h) { nh = srcDim.h; nw = nh * r; }
        let nx = cx - nw / 2, ny = cy - nh / 2;
        nx = Math.max(0, Math.min(srcDim.w - nw, nx));
        ny = Math.max(0, Math.min(srcDim.h - nh, ny));
        updateWidgetValue(id, "cropX", Math.round(nx));
        updateWidgetValue(id, "cropY", Math.round(ny));
        updateWidgetValue(id, "cropW", Math.round(nw));
        updateWidgetValue(id, "cropH", Math.round(nh));
      }
    }
  }, [id, srcDim, cropX, cropY, cropW, cropH, manualW, manualH, updateWidgetValue]);

  // ── Visual scaling ─────────────────────────────────────────────────
  const previewMaxH = 540;
  const aspectStyle = srcDim ? {
    aspectRatio: `${srcDim.w} / ${srcDim.h}`,
    maxHeight: previewMaxH,
  } : undefined;

  // Convert source-space crop → CSS percentages over the preview container
  const pct = srcDim && srcDim.w > 0 && srcDim.h > 0 ? {
    left: `${(effectiveCrop.x / srcDim.w) * 100}%`,
    top: `${(effectiveCrop.y / srcDim.h) * 100}%`,
    width: `${(effectiveCrop.w / srcDim.w) * 100}%`,
    height: `${(effectiveCrop.h / srcDim.h) * 100}%`,
  } : null;

  // Highlights
  const inHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const outHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(inHL || outHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  const isFresh = !extracting && lastExtractedRef.current && previewUrl
    && lastExtractedRef.current.url === srcUrl
    && lastExtractedRef.current.key === `${effectiveCrop.x}|${effectiveCrop.y}|${effectiveCrop.w}|${effectiveCrop.h}`;

  return (
    <div className={`crop-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="crop-node-inner">
        <div className="crop-accent" />
        <div className="crop-header">
          <span className="crop-icon">✂</span>
          <div className="crop-header-text">
            <span className="crop-title">Crop</span>
            <span className="crop-status">
              {!srcUrl ? "NO INPUT"
                : error ? "ERROR"
                : dragging ? "ADJUSTING…"
                : extracting ? "CROPPING…"
                : isFresh ? "FRESH"
                : "PENDING"}
            </span>
          </div>
        </div>
      </div>

      <div className="crop-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="input" className={`slot-handle ${inHL}`} style={{ color: IMAGE_COLOR }} />
          <span className="type-badge" style={{ color: IMAGE_COLOR, borderColor: IMAGE_COLOR + "66", backgroundColor: IMAGE_COLOR + "12" }}>IMAGE</span>
          <span className="nanob-input-label">Image</span>
        </div>
      </div>

      <div className="crop-preview-wrap nodrag" onClick={(e) => e.stopPropagation()}>
        {srcUrl && srcDim ? (
          <div ref={previewRef} className="crop-preview" style={aspectStyle}>
            <img src={srcUrl} alt="" className="crop-img" draggable={false} crossOrigin="anonymous" />
            {pct && (
              <>
                {/* 4 dimming masks around the crop area */}
                <div className="crop-mask" style={{ left: 0, top: 0, right: 0, height: pct.top }} />
                <div className="crop-mask" style={{ left: 0, top: `calc(${pct.top} + ${pct.height})`, right: 0, bottom: 0 }} />
                <div className="crop-mask" style={{ left: 0, top: pct.top, width: pct.left, height: pct.height }} />
                <div className="crop-mask" style={{ left: `calc(${pct.left} + ${pct.width})`, top: pct.top, right: 0, height: pct.height }} />
                {/* Crop rect */}
                <div
                  className="crop-rect"
                  style={pct}
                  onPointerDown={onPointerDownOverlay("move")}
                >
                  <div className="crop-handle nw" onPointerDown={onPointerDownOverlay("nw")} />
                  <div className="crop-handle ne" onPointerDown={onPointerDownOverlay("ne")} />
                  <div className="crop-handle sw" onPointerDown={onPointerDownOverlay("sw")} />
                  <div className="crop-handle se" onPointerDown={onPointerDownOverlay("se")} />
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="crop-placeholder">{srcUrl ? "Loading…" : "Connect an IMAGE input"}</div>
        )}
      </div>

      {srcDim && (
        <div className="crop-controls nodrag" onClick={(e) => e.stopPropagation()}>
          <select className="crop-aspect-select" value={aspect} onChange={onAspectChange}>
            <option value="custom">Custom (free)</option>
            <option value="1:1">1:1</option>
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="4:3">4:3</option>
            <option value="3:4">3:4</option>
            <option value="manual">Manual W:H</option>
          </select>
          {aspect === "manual" && (
            <div className="crop-manual-row">
              <input type="number" className="crop-manual-input" min={1} value={manualW}
                onChange={(e) => updateWidgetValue(id, "manualW", Math.max(1, parseInt(e.target.value) || 1))}
                onClick={(e) => e.stopPropagation()} />
              <span className="crop-manual-sep">:</span>
              <input type="number" className="crop-manual-input" min={1} value={manualH}
                onChange={(e) => updateWidgetValue(id, "manualH", Math.max(1, parseInt(e.target.value) || 1))}
                onClick={(e) => e.stopPropagation()} />
            </div>
          )}
          <div className="crop-meta">
            <span><span className="crop-meta-label">Crop:</span> <span className="crop-meta-value">{effectiveCrop.w} × {effectiveCrop.h}</span></span>
            <span><span className="crop-meta-label">at</span> <span className="crop-meta-value">{effectiveCrop.x}, {effectiveCrop.y}</span></span>
          </div>
        </div>
      )}

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="crop-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <span className="type-badge" style={{ color: IMAGE_COLOR, borderColor: IMAGE_COLOR + "66", backgroundColor: IMAGE_COLOR + "12" }}>IMAGE</span>
          <span className="nanob-output-label">Cropped</span>
          <Handle type="source" position={Position.Right} id="output_0" className={`slot-handle ${outHL}`} style={{ color: IMAGE_COLOR }} />
        </div>
      </div>
    </div>
  );
}

export default memo(CropNode);
