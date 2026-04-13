import { useRef, useState, useEffect, useCallback } from "react";

interface MaskCanvasProps {
  imageUrl: string;
  onSave: (maskDataUrl: string) => void;
  onClose: () => void;
}

export default function MaskCanvas({ imageUrl, onSave, onClose }: MaskCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);
  const [brushSize, setBrushSize] = useState(30);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [isErasing, setIsErasing] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [imgSize, setImgSize] = useState({ w: 512, h: 512 });

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
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
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
      const alpha = brushOpacity / 100;
      ctx.fillStyle = `rgba(255, 0, 0, ${alpha * 0.6})`;
    }
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }, [drawing, brushSize, brushOpacity, isErasing]);

  const handleSave = () => {
    const mask = maskRef.current;
    if (!mask) return;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = mask.width;
    exportCanvas.height = mask.height;
    const ctx = exportCanvas.getContext("2d")!;

    // Black background (keep areas)
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, mask.width, mask.height);

    // Convert red overlay alpha → white intensity (grayscale mask)
    const maskCtx = mask.getContext("2d")!;
    const maskData = maskCtx.getImageData(0, 0, mask.width, mask.height);
    const exportData = ctx.getImageData(0, 0, mask.width, mask.height);

    for (let i = 0; i < maskData.data.length; i += 4) {
      const alpha = maskData.data[i + 3]; // alpha channel = paint intensity
      if (alpha > 2) {
        // Map alpha to white intensity: higher alpha = whiter = more change
        const intensity = Math.min(255, Math.round((alpha / 153) * 255)); // 153 = max alpha at 100% opacity (0.6*255)
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
            onMouseDown={(e) => { setDrawing(true); draw(e); }}
            onMouseMove={draw}
            onMouseUp={() => setDrawing(false)}
            onMouseLeave={() => setDrawing(false)}
            style={{ cursor: "crosshair" }}
          />
        </div>

        <div className="mask-toolbar">
          <div className="mask-tool-group">
            <button className={`mask-tool-btn ${!isErasing ? "active" : ""}`} onClick={() => setIsErasing(false)}>🖌️ Brush</button>
            <button className={`mask-tool-btn ${isErasing ? "active" : ""}`} onClick={() => setIsErasing(true)}>🧹 Eraser</button>
            <button className="mask-tool-btn" onClick={handleClear}>🗑️ Clear</button>
          </div>
          <div className="mask-tool-group">
            <label className="mask-size-label">Size: {brushSize}</label>
            <input type="range" min={5} max={100} value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="mask-size-slider" />
          </div>
          <div className="mask-tool-group">
            <label className="mask-size-label">Strength: {brushOpacity}%</label>
            <input type="range" min={10} max={100} step={10} value={brushOpacity} onChange={(e) => setBrushOpacity(parseInt(e.target.value))} className="mask-size-slider" />
          </div>
          <div className="mask-tool-group">
            <button className="mask-save-btn" onClick={handleSave}>Apply Mask</button>
          </div>
        </div>
      </div>
    </div>
  );
}
