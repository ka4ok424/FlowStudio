import { useWorkflowStore } from "../../store/workflowStore";

// ── Enhance Properties ───────────────────────────────────────────
function EnhanceProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const scale = data.widgetValues?.scale ?? 2;
  const steps = data.widgetValues?.steps ?? 20;
  const restoration = data.widgetValues?.restoration ?? 0.5;
  const cfg = data.widgetValues?.cfg ?? 4.0;
  const colorFix = data.widgetValues?.colorFix ?? "AdaIn";
  const seed = data.widgetValues?.seed ?? "";
  const prompt = data.widgetValues?.prompt ?? "high quality, detailed, sharp";
  const negPrompt = data.widgetValues?.negPrompt ?? "blurry, noise, artifacts, low quality";

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Scale</div>
        <div className="props-aspect-row">
          {[1, 2, 3, 4].map((s) => (
            <button key={s} className={`props-aspect-btn ${scale === s ? "active" : ""}`}
              onClick={() => updateWidgetValue(nodeId, "scale", s)}>{s}x</button>
          ))}
        </div>
      </div>
      <div className="props-section">
        <div className="props-section-title">Restoration Strength</div>
        <input type="range" className="props-range" min={0} max={1} step={0.05} value={restoration}
          onChange={(e) => updateWidgetValue(nodeId, "restoration", parseFloat(e.target.value))} />
        <span className="props-range-value">{restoration.toFixed(2)}</span>
        <p className="settings-hint" style={{ marginTop: 4 }}>0 = no change · 0.5 = balanced · 1.0 = max detail</p>
      </div>
      <div className="props-section">
        <div className="props-section-title">Steps</div>
        <input type="range" className="props-range" min={5} max={50} step={1} value={steps}
          onChange={(e) => updateWidgetValue(nodeId, "steps", parseInt(e.target.value))} />
        <span className="props-range-value">{steps}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">Color Fix</div>
        <select className="props-select" value={colorFix}
          onChange={(e) => updateWidgetValue(nodeId, "colorFix", e.target.value)}>
          <option value="None">None</option>
          <option value="AdaIn">AdaIn (recommended)</option>
          <option value="Wavelet">Wavelet</option>
        </select>
      </div>
      <div className="props-section">
        <div className="props-section-title">Seed</div>
        <div className="props-input-row">
          <input type="number" className="props-input" value={seed} placeholder="Random"
            onChange={(e) => updateWidgetValue(nodeId, "seed", e.target.value)} />
          <button className="props-dice-btn"
            onClick={() => updateWidgetValue(nodeId, "seed", Math.floor(Math.random() * 2147483647).toString())}>🎲</button>
        </div>
      </div>
      <details className="props-section props-temp-section">
        <summary className="props-temp-header">Advanced <span className="props-temp-badge">PRO</span></summary>
        <div className="props-section">
          <div className="props-section-title">CFG</div>
          <input type="range" className="props-range" min={1} max={15} step={0.5} value={cfg}
            onChange={(e) => updateWidgetValue(nodeId, "cfg", parseFloat(e.target.value))} />
          <span className="props-range-value">{cfg.toFixed(1)}</span>
        </div>
        <div className="props-section">
          <div className="props-section-title">Positive Prompt</div>
          <textarea className="props-textarea" value={prompt} rows={2}
            onChange={(e) => updateWidgetValue(nodeId, "prompt", e.target.value)} />
        </div>
        <div className="props-section">
          <div className="props-section-title">Negative Prompt</div>
          <textarea className="props-textarea" value={negPrompt} rows={2}
            onChange={(e) => updateWidgetValue(nodeId, "negPrompt", e.target.value)} />
        </div>
      </details>

      <p className="settings-hint" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 12, lineHeight: 1.4 }}>
        Heavy node: ~12 GB VRAM (SDXL + SUPIR).
      </p>
    </>
  );
}

export default EnhanceProperties;
