import { useRef, useState, useEffect, useCallback } from "react";

interface MaskCanvasProps {
  imageUrl: string;
  existingMask?: string | null;
  onSave: (maskDataUrl: string) => void;
  onClose: () => void;
}

export default function MaskCanvas({ imageUrl, existingMask, onSave, onClose }: MaskCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const brushSizeRef = useRef(30);
  const brushOpacityRef = useRef(100);
  const [brushSize, setBrushSize] = useState(30);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [isErasing, setIsErasing] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [imgSize, setImgSize] = useState({ w: 512, h: 512 });

  // Undo/Redo history
  const historyRef = useRef<ImageData[]>([]);
  const historyIdxRef = useRef(-1);
  const MAX_UNDO = 30;

  const saveToHistory = useCallback(() => {
    const mask = maskRef.current;
    if (!mask) return;
    const ctx = mask.getContext("2d")!;
    const data = ctx.getImageData(0, 0, mask.width, mask.height);
    // Trim future states
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1);
    historyRef.current.push(data);
    if (historyRef.current.length > MAX_UNDO) historyRef.current.shift();
    historyIdxRef.current = historyRef.current.length - 1;
  }, []);

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current--;
    const mask = maskRef.current;
    if (!mask) return;
    const ctx = mask.getContext("2d")!;
    ctx.putImageData(historyRef.current[historyIdxRef.current], 0, 0);
  }, []);

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current++;
    const mask = maskRef.current;
    if (!mask) return;
    const ctx = mask.getContext("2d")!;
    ctx.putImageData(historyRef.current[historyIdxRef.current], 0, 0);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // Load image + existing mask
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const scale = Math.min(800 / img.width, 600 / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      setImgSize({ w, h });

      const canvas = canvasRef.current;
      const mask = maskRef.current;
      if (!canvas || !mask) return;
      canvas.width = w; canvas.height = h;
      mask.width = w; mask.height = h;

      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);

      const mctx = mask.getContext("2d")!;
      mctx.clearRect(0, 0, w, h);

      // Load existing mask if available
      if (existingMask) {
        const maskImg = new Image();
        maskImg.crossOrigin = "anonymous";
        maskImg.onload = () => {
          // Convert B&W mask back to red overlay
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = w; tempCanvas.height = h;
          const tctx = tempCanvas.getContext("2d")!;
          tctx.drawImage(maskImg, 0, 0, w, h);
          const maskData = tctx.getImageData(0, 0, w, h);

          const overlayData = mctx.createImageData(w, h);
          for (let i = 0; i < maskData.data.length; i += 4) {
            const brightness = maskData.data[i]; // white = painted area
            if (brightness > 10) {
              overlayData.data[i] = 255;     // R
              overlayData.data[i + 1] = 0;   // G
              overlayData.data[i + 2] = 0;   // B
              overlayData.data[i + 3] = Math.round((brightness / 255) * 153); // alpha
            }
          }
          mctx.putImageData(overlayData, 0, 0);
          saveToHistory();
        };
        maskImg.src = existingMask;
      } else {
        saveToHistory();
      }
    };
    img.src = imageUrl;
  }, [imageUrl, existingMask, saveToHistory]);

  // Update cursor position. `display` is toggled when the cursor enters/leaves
  // the canvas; coords are computed every move whether the pointer is inside
  // or outside the bounds.
  const updateCursor = useCallback((e: React.PointerEvent | { clientX: number; clientY: number }) => {
    const cursor = cursorRef.current;
    const mask = maskRef.current;
    if (!cursor || !mask) return;
    const rect = mask.getBoundingClientRect();
    const size = brushSizeRef.current;
    cursor.style.left = `${e.clientX - rect.left - size / 2}px`;
    cursor.style.top = `${e.clientY - rect.top - size / 2}px`;
    cursor.style.width = `${size}px`;
    cursor.style.height = `${size}px`;
  }, []);

  // Paint a single stamp at (clientX, clientY).
  // The brush is a circle. Near any canvas edge we add a RECTANGLE from the
  // edge inward to the brush center to the same path — so when `ctx.fill()`
  // runs it paints circle + edge-spill as ONE shape at the same alpha. This
  // guarantees full coverage right up to the boundary row/column without
  // doubling alpha in the overlap zone.
  const stampAt = useCallback((clientX: number, clientY: number) => {
    const mask = maskRef.current;
    if (!mask) return;
    const rect = mask.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const r = brushSizeRef.current / 2;
    const ctx = mask.getContext("2d")!;
    if (isErasing) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0, 0, 0, 1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      const alpha = brushOpacityRef.current / 100;
      ctx.fillStyle = `rgba(255, 0, 0, ${alpha * 0.6})`;
    }
    const W = mask.width, H = mask.height;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (y < r)     ctx.rect(x - r, 0, 2 * r, y);
    if (y > H - r) ctx.rect(x - r, y, 2 * r, H - y);
    if (x < r)     ctx.rect(0,     y - r, x,     2 * r);
    if (x > W - r) ctx.rect(x,     y - r, W - x, 2 * r);
    ctx.fill();
  }, [isErasing]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    setDrawing(true);
    // Pointer capture ensures we keep receiving move/up events even when the
    // cursor leaves the canvas — so the brush can paint right up to and past
    // the edge without the gesture being interrupted by onMouseLeave.
    (e.target as Element).setPointerCapture?.(e.pointerId);
    stampAt(e.clientX, e.clientY);
    updateCursor(e);
  }, [stampAt, updateCursor]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    updateCursor(e);
    if (!drawing) return;
    stampAt(e.clientX, e.clientY);
  }, [drawing, stampAt, updateCursor]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (drawing) {
      setDrawing(false);
      saveToHistory();
    }
  }, [drawing, saveToHistory]);

  const handleSave = () => {
    const mask = maskRef.current;
    if (!mask) return;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = mask.width;
    exportCanvas.height = mask.height;
    const ctx = exportCanvas.getContext("2d")!;

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, mask.width, mask.height);

    const maskCtx = mask.getContext("2d")!;
    const maskData = maskCtx.getImageData(0, 0, mask.width, mask.height);
    const exportData = ctx.getImageData(0, 0, mask.width, mask.height);

    for (let i = 0; i < maskData.data.length; i += 4) {
      const alpha = maskData.data[i + 3];
      if (alpha > 2) {
        const intensity = Math.min(255, Math.round((alpha / 153) * 255));
        exportData.data[i] = intensity;
        exportData.data[i + 1] = intensity;
        exportData.data[i + 2] = intensity;
        exportData.data[i + 3] = 255;
      }
    }
    ctx.putImageData(exportData, 0, 0);

    onSave(exportCanvas.toDataURL("image/png"));
  };

  const handleClear = () => {
    const mask = maskRef.current;
    if (!mask) return;
    const ctx = mask.getContext("2d")!;
    ctx.clearRect(0, 0, mask.width, mask.height);
    saveToHistory();
  };

  return (
    <div className="mask-overlay" onClick={onClose}>
      <div className="mask-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mask-header">
          <span className="mask-title">Draw Mask</span>
          <span className="mask-hint">White = full change · Gray = partial · Black = keep</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="mask-canvas-wrap" style={{ width: imgSize.w, height: imgSize.h }}>
          <canvas ref={canvasRef} className="mask-canvas-bg" />
          <canvas
            ref={maskRef}
            className="mask-canvas-draw"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerEnter={(e) => { if (cursorRef.current) cursorRef.current.style.display = "block"; updateCursor(e); }}
            onPointerLeave={() => {
              // Hide the visual brush ring but DON'T stop drawing — pointer
              // capture keeps the gesture alive so the user can paint past
              // the canvas edge for full edge coverage.
              if (cursorRef.current) cursorRef.current.style.display = "none";
            }}
            style={{ cursor: "none", touchAction: "none" }}
          />
          <div ref={cursorRef} className="mask-brush-cursor" style={{ display: "none" }} />
        </div>

        <div className="mask-toolbar">
          <div className="mask-tool-group">
            <button className={`mask-tool-btn ${!isErasing ? "active" : ""}`} onClick={() => setIsErasing(false)}>🖌️ Brush</button>
            <button className={`mask-tool-btn ${isErasing ? "active" : ""}`} onClick={() => setIsErasing(true)}>🧹 Eraser</button>
            <button className="mask-tool-btn" onClick={handleClear}>🗑️ Clear</button>
            <button className="mask-tool-btn" onClick={undo} title="Undo (Cmd+Z)">↩</button>
            <button className="mask-tool-btn" onClick={redo} title="Redo (Cmd+Shift+Z)">↪</button>
          </div>
          <div className="mask-tool-group">
            <label className="mask-size-label">Size: {brushSize}</label>
            <input type="range" min={5} max={100} value={brushSize} onChange={(e) => { const v = parseInt(e.target.value); brushSizeRef.current = v; setBrushSize(v); }} className="mask-size-slider" />
          </div>
          <div className="mask-tool-group">
            <label className="mask-size-label">Strength: {brushOpacity}%</label>
            <input type="range" min={10} max={100} step={10} value={brushOpacity} onChange={(e) => { const v = parseInt(e.target.value); brushOpacityRef.current = v; setBrushOpacity(v); }} className="mask-size-slider" />
          </div>
          <div className="mask-tool-group">
            <button className="mask-save-btn" onClick={handleSave}>Apply Mask</button>
          </div>
        </div>
      </div>
    </div>
  );
}
