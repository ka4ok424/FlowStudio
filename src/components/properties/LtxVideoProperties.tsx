import { useWorkflowStore } from "../../store/workflowStore";

// ── LTX Video Properties ─────────────────────────────────────────
function LtxVideoProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const steps = data.widgetValues?.steps ?? 8;
  const cfg = data.widgetValues?.cfg ?? 1.0;
  const width = data.widgetValues?.width ?? 768;
  const height = data.widgetValues?.height ?? 512;
  const frames = data.widgetValues?.frames ?? 97;
  const fps = data.widgetValues?.fps ?? 24;
  const seed = data.widgetValues?.seed ?? "";
  const negativePrompt = data.widgetValues?.negativePrompt ?? "";
  const stg = data.widgetValues?.stg ?? 0.6;
  const maxShift = data.widgetValues?.maxShift ?? 0.6;
  const baseShift = data.widgetValues?.baseShift ?? 0.6;
  const frameStrength = data.widgetValues?.frameStrength ?? 0.85;
  const maxLength = data.widgetValues?.maxLength ?? 512;

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Frames ({(frames / fps).toFixed(1)}s at {fps}fps)</div>
        <input type="range" className="props-range" min={25} max={193} step={8} value={frames}
          onChange={(e) => updateWidgetValue(nodeId, "frames", parseInt(e.target.value))} />
        <span className="props-range-value">{frames}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">FPS</div>
        <input type="range" className="props-range" min={8} max={30} step={1} value={fps}
          onChange={(e) => updateWidgetValue(nodeId, "fps", parseInt(e.target.value))} />
        <span className="props-range-value">{fps}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">Size</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input className="props-input" type="number" value={width ?? ""} min={64} max={2048}
            onChange={(e) => updateWidgetValue(nodeId, "width", e.target.value === "" ? "" : Math.min(2048, parseInt(e.target.value)))}
            onBlur={() => { if (!width || isNaN(width)) updateWidgetValue(nodeId, "width", 768); }} style={{ width: "50%" }} />
          <span style={{ color: "var(--text-muted)", alignSelf: "center" }}>x</span>
          <input className="props-input" type="number" value={height ?? ""} min={64} max={2048}
            onChange={(e) => updateWidgetValue(nodeId, "height", e.target.value === "" ? "" : Math.min(2048, parseInt(e.target.value)))}
            onBlur={() => { if (!height || isNaN(height)) updateWidgetValue(nodeId, "height", 512); }} style={{ width: "50%" }} />
        </div>
        <div className="props-aspect-row" style={{ marginTop: 10 }}>
          {[{w:512,h:512,l:"1:1"},{w:768,h:512,l:"3:2"},{w:512,h:768,l:"2:3"},{w:768,h:432,l:"16:9"}].map((s) => (
            <button key={s.l} className={`props-aspect-btn ${width === s.w && height === s.h ? "active" : ""}`}
              onClick={() => { updateWidgetValue(nodeId, "width", s.w); updateWidgetValue(nodeId, "height", s.h); }}>{s.l}</button>
          ))}
        </div>
      </div>
      <div className="props-section">
        <div className="props-section-title">CFG</div>
        <input type="range" className="props-range" min={1} max={5} step={0.1} value={cfg}
          onChange={(e) => updateWidgetValue(nodeId, "cfg", parseFloat(e.target.value))} />
        <span className="props-range-value">{cfg.toFixed(1)}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">Steps</div>
        <input type="range" className="props-range" min={4} max={20} step={1} value={steps}
          onChange={(e) => updateWidgetValue(nodeId, "steps", parseInt(e.target.value))} />
        <span className="props-range-value">{steps}</span>
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
          <div className="props-section-title">Negative Prompt</div>
          <textarea className="props-textarea" value={negativePrompt} rows={2} placeholder="What to avoid..."
            onChange={(e) => updateWidgetValue(nodeId, "negativePrompt", e.target.value)} />
        </div>
        <div className="props-section">
          <div className="props-section-title">Max Prompt Length</div>
          <input type="range" className="props-range" min={128} max={2048} step={128} value={maxLength}
            onChange={(e) => updateWidgetValue(nodeId, "maxLength", parseInt(e.target.value))} />
          <span className="props-range-value">{maxLength}</span>
        </div>
        <div className="props-section">
          <div className="props-section-title">STG (Spatiotemporal Guidance)</div>
          <input type="range" className="props-range" min={0} max={2} step={0.1} value={stg}
            onChange={(e) => updateWidgetValue(nodeId, "stg", parseFloat(e.target.value))} />
          <span className="props-range-value">{stg.toFixed(1)}</span>
        </div>
        <div className="props-section">
          <div className="props-section-title">Max Shift</div>
          <input type="range" className="props-range" min={0.1} max={3} step={0.1} value={maxShift}
            onChange={(e) => updateWidgetValue(nodeId, "maxShift", parseFloat(e.target.value))} />
          <span className="props-range-value">{maxShift.toFixed(1)}</span>
        </div>
        <div className="props-section">
          <div className="props-section-title">Base Shift</div>
          <input type="range" className="props-range" min={0.1} max={2} step={0.1} value={baseShift}
            onChange={(e) => updateWidgetValue(nodeId, "baseShift", parseFloat(e.target.value))} />
          <span className="props-range-value">{baseShift.toFixed(1)}</span>
        </div>
        <div className="props-section">
          <div className="props-section-title">Frame Guide Strength</div>
          <input type="range" className="props-range" min={0.1} max={1} step={0.05} value={frameStrength}
            onChange={(e) => updateWidgetValue(nodeId, "frameStrength", parseFloat(e.target.value))} />
          <span className="props-range-value">{frameStrength.toFixed(2)}</span>
        </div>
      </details>
    </>
  );
}

export default LtxVideoProperties;
