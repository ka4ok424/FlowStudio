import { useWorkflowStore } from "../../store/workflowStore";

// ── Upscale Properties ────────────────────────────────────────────
function UpscaleProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const scale = data.widgetValues?.scale || 2;
  const method = data.widgetValues?.method ?? "ai_ultrasharp";
  const isAI = method.startsWith("ai_");

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Method</div>
        <select className="props-select" value={method}
          onChange={(e) => updateWidgetValue(nodeId, "method", e.target.value)}>
          <optgroup label="AI Upscale (recommended)">
            <option value="ai_ultrasharp">UltraSharp x4 (CG / 3D / universal)</option>
            <option value="ai_realesrgan">RealESRGAN x4 (photo)</option>
            <option value="ai_realesrgan_x2">RealESRGAN x2 (photo)</option>
            <option value="ai_anime">RealESRGAN x4 (anime)</option>
          </optgroup>
          <optgroup label="Classic (fast, lower quality)">
            {["lanczos", "bicubic", "bilinear", "nearest-exact", "area"].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </optgroup>
        </select>
      </div>
      {!isAI && (
        <div className="props-section">
          <div className="props-section-title">Scale</div>
          <div className="props-aspect-row">
            {[1.5, 2, 3, 4].map((s) => (
              <button key={s} className={`props-aspect-btn ${scale === s ? "active" : ""}`}
                onClick={() => updateWidgetValue(nodeId, "scale", s)}>{s}x</button>
            ))}
          </div>
        </div>
      )}
      {isAI && (
        <div className="props-section">
          <p className="settings-hint">AI upscale always outputs 4x resolution. 512px → 2048px</p>
        </div>
      )}
    </>
  );
}

export default UpscaleProperties;
