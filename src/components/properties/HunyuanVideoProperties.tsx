import { useWorkflowStore } from "../../store/workflowStore";

function HunyuanVideoProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const steps = data.widgetValues?.steps ?? 30;
  const cfg = data.widgetValues?.cfg ?? 6.0;
  const flowShift = data.widgetValues?.flowShift ?? 9.0;
  const width = data.widgetValues?.width ?? 512;
  const height = data.widgetValues?.height ?? 320;
  const numFrames = data.widgetValues?.numFrames ?? 49;
  const fps = data.widgetValues?.fps ?? 24;
  const seed = data.widgetValues?.seed ?? "";
  const denoise = data.widgetValues?.denoise ?? 1.0;

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
          <input className="props-input" type="number" value={width ?? ""} min={64} max={1280}
            onChange={(e) => updateWidgetValue(nodeId, "width", e.target.value === "" ? "" : Math.min(1280, parseInt(e.target.value)))}
            onBlur={() => { if (!width || isNaN(width)) updateWidgetValue(nodeId, "width", 512); }} style={{ width: "50%" }} />
          <span style={{ color: "var(--text-muted)", alignSelf: "center" }}>x</span>
          <input className="props-input" type="number" value={height ?? ""} min={64} max={1280}
            onChange={(e) => updateWidgetValue(nodeId, "height", e.target.value === "" ? "" : Math.min(1280, parseInt(e.target.value)))}
            onBlur={() => { if (!height || isNaN(height)) updateWidgetValue(nodeId, "height", 320); }} style={{ width: "50%" }} />
        </div>
        <div className="props-aspect-row" style={{ marginTop: 10 }}>
          {[{w:512,h:320,l:"16:10"},{w:720,h:480,l:"3:2"},{w:480,h:720,l:"2:3"},{w:512,h:512,l:"1:1"}].map((s) => (
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
        <div className="props-section-title">CFG (Guidance)</div>
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
          <div className="props-section-title">Flow Shift</div>
          <input type="range" className="props-range" min={0} max={20} step={0.5} value={flowShift}
            onChange={(e) => updateWidgetValue(nodeId, "flowShift", parseFloat(e.target.value))} />
          <span className="props-range-value">{flowShift.toFixed(1)}</span>
        </div>
        <div className="props-section">
          <div className="props-section-title">Denoise</div>
          <input type="range" className="props-range" min={0.1} max={1} step={0.05} value={denoise}
            onChange={(e) => updateWidgetValue(nodeId, "denoise", parseFloat(e.target.value))} />
          <span className="props-range-value">{denoise.toFixed(2)}</span>
        </div>
      </details>
    </>
  );
}

export default HunyuanVideoProperties;
