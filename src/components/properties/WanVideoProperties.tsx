import { useWorkflowStore } from "../../store/workflowStore";

function WanVideoProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const steps = data.widgetValues?.steps ?? 30;
  const cfg = data.widgetValues?.cfg ?? 6.0;
  const shift = data.widgetValues?.shift ?? 5.0;
  const width = data.widgetValues?.width ?? 832;
  const height = data.widgetValues?.height ?? 480;
  const numFrames = data.widgetValues?.numFrames ?? 49;
  const fps = data.widgetValues?.fps ?? 16;
  const seed = data.widgetValues?.seed ?? "";
  const negativePrompt = data.widgetValues?.negativePrompt ?? "";
  const noiseAug = data.widgetValues?.noiseAug ?? 0.0;

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Frames ({(numFrames / fps).toFixed(1)}s at {fps}fps)</div>
        <input type="range" className="props-range" min={13} max={129} step={4} value={numFrames}
          onChange={(e) => updateWidgetValue(nodeId, "numFrames", parseInt(e.target.value))} />
        <span className="props-range-value">{numFrames}</span>
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
            onBlur={() => { if (!width || isNaN(width)) updateWidgetValue(nodeId, "width", 832); }} style={{ width: "50%" }} />
          <span style={{ color: "var(--text-muted)", alignSelf: "center" }}>x</span>
          <input className="props-input" type="number" value={height ?? ""} min={64} max={2048}
            onChange={(e) => updateWidgetValue(nodeId, "height", e.target.value === "" ? "" : Math.min(2048, parseInt(e.target.value)))}
            onBlur={() => { if (!height || isNaN(height)) updateWidgetValue(nodeId, "height", 480); }} style={{ width: "50%" }} />
        </div>
        <div className="props-aspect-row" style={{ marginTop: 10 }}>
          {[{w:832,h:480,l:"16:9"},{w:480,h:832,l:"9:16"},{w:672,h:672,l:"1:1"},{w:480,h:720,l:"2:3"}].map((s) => (
            <button key={s.l} className={`props-aspect-btn ${width === s.w && height === s.h ? "active" : ""}`}
              onClick={() => { updateWidgetValue(nodeId, "width", s.w); updateWidgetValue(nodeId, "height", s.h); }}>{s.l}</button>
          ))}
        </div>
      </div>
      <div className="props-section">
        <div className="props-section-title">Steps</div>
        <input type="range" className="props-range" min={10} max={50} step={1} value={steps}
          onChange={(e) => updateWidgetValue(nodeId, "steps", parseInt(e.target.value))} />
        <span className="props-range-value">{steps}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">CFG</div>
        <input type="range" className="props-range" min={1} max={15} step={0.5} value={cfg}
          onChange={(e) => updateWidgetValue(nodeId, "cfg", parseFloat(e.target.value))} />
        <span className="props-range-value">{cfg.toFixed(1)}</span>
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
          <div className="props-section-title">Flow Shift</div>
          <input type="range" className="props-range" min={0} max={20} step={0.5} value={shift}
            onChange={(e) => updateWidgetValue(nodeId, "shift", parseFloat(e.target.value))} />
          <span className="props-range-value">{shift.toFixed(1)}</span>
        </div>
        <div className="props-section">
          <div className="props-section-title">Noise Augmentation</div>
          <input type="range" className="props-range" min={0} max={1} step={0.05} value={noiseAug}
            onChange={(e) => updateWidgetValue(nodeId, "noiseAug", parseFloat(e.target.value))} />
          <span className="props-range-value">{noiseAug.toFixed(2)}</span>
        </div>
      </details>
    </>
  );
}

export default WanVideoProperties;
