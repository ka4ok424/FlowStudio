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

  // Update cursor position
  const updateCursor = useCallback((e: React.MouseEvent) => {
    const cursor = cursorRef.current;
    const mask = maskRef.current;
    if (!cursor || !mask) return;
    const rect = mask.getBoundingClientRect();
    const size = brushSizeRef.current;
    cursor.style.left = `${e.clientX - rect.left - size / 2}px`;
    cursor.style.top = `${e.clientY - rect.top - size / 2}px`;
    cursor.style.width = `${size}px`;
    cursor.style.height = `${size}px`;
    cursor.style.display = "block";
  }, []);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    updateCursor(e);
    if (!drawing) return;
    const mask = maskRef.current;
    if (!mask) return;
    const rect = mask.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = mask.getContext("2d")!;

    if (isErasing) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0, 0, 0, 1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      const alpha = brushOpacityRef.current / 100;
      ctx.fillStyle = `rgba(255, 0, 0, ${alpha * 0.6})`;
    }
    ctx.beginPath();
    ctx.arc(x, y, brushSizeRef.current / 2, 0, Math.PI * 2);
    ctx.fill();
  }, [drawing, isErasing, updateCursor]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    setDrawing(true);
    // Draw single dot on click
    const mask = maskRef.current;
    if (!mask) return;
    const rect = mask.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = mask.getContext("2d")!;
    if (isErasing) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0, 0, 0, 1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      const alpha = brushOpacityRef.current / 100;
      ctx.fillStyle = `rgba(255, 0, 0, ${alpha * 0.6})`;
    }
    ctx.beginPath();
    ctx.arc(x, y, brushSizeRef.current / 2, 0, Math.PI * 2);
    ctx.fill();
    updateCursor(e);
  }, [isErasing, updateCursor]);

  const handleMouseUp = useCallback(() => {
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
            onMouseDown={handleMouseDown}
            onMouseMove={draw}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { setDrawing(false); if (cursorRef.current) cursorRef.current.style.display = "none"; }}
            onMouseEnter={updateCursor}
            style={{ cursor: "none" }}
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
