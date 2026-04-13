import { useWorkflowStore } from "../../store/workflowStore";

// ── Img2Img Properties ───────────────────────────────────────────
function Img2ImgProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const denoise = data.widgetValues?.denoise ?? 0.75;
  const steps = data.widgetValues?.steps ?? 28;
  const cfg = data.widgetValues?.cfg ?? 3.5;
  const width = data.widgetValues?.width ?? 1024;
  const height = data.widgetValues?.height ?? 1024;
  const seed = data.widgetValues?.seed ?? "";
  const sampler = data.widgetValues?.sampler ?? "euler";
  const scheduler = data.widgetValues?.scheduler ?? "simple";
  const negativePrompt = data.widgetValues?.negativePrompt ?? "";
  const refMethod = data.widgetValues?.refMethod ?? "offset";
  const kvCache = data.widgetValues?.kvCache ?? false;

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Denoise Strength</div>
        <input type="range" className="props-range" min={0.1} max={1.0} step={0.05} value={denoise}
          onChange={(e) => updateWidgetValue(nodeId, "denoise", parseFloat(e.target.value))} />
        <span className="props-range-value">{denoise.toFixed(2)}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">Steps</div>
        <input type="range" className="props-range" min={4} max={50} step={1} value={steps}
          onChange={(e) => updateWidgetValue(nodeId, "steps", parseInt(e.target.value))} />
        <span className="props-range-value">{steps}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">CFG</div>
        <input type="range" className="props-range" min={1} max={10} step={0.5} value={cfg}
          onChange={(e) => updateWidgetValue(nodeId, "cfg", parseFloat(e.target.value))} />
        <span className="props-range-value">{cfg}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">Size</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input className="props-input" type="number" value={width ?? ""} min={64} max={4096}
            onChange={(e) => updateWidgetValue(nodeId, "width", e.target.value === "" ? "" : Math.min(4096, parseInt(e.target.value)))}
            onBlur={() => { if (!width || isNaN(width)) updateWidgetValue(nodeId, "width", 1024); }} style={{ width: "50%" }} />
          <span style={{ color: "var(--text-muted)", alignSelf: "center" }}>x</span>
          <input className="props-input" type="number" value={height ?? ""} min={64} max={4096}
            onChange={(e) => updateWidgetValue(nodeId, "height", e.target.value === "" ? "" : Math.min(4096, parseInt(e.target.value)))}
            onBlur={() => { if (!height || isNaN(height)) updateWidgetValue(nodeId, "height", 1024); }} style={{ width: "50%" }} />
        </div>
        <div className="props-aspect-row" style={{ marginTop: 10 }}>
          {[{w:512,h:512,l:"1:1"},{w:720,h:1280,l:"9:16"},{w:1280,h:720,l:"16:9"}].map((s) => (
            <button key={s.l} className={`props-aspect-btn ${width === s.w && height === s.h ? "active" : ""}`}
              onClick={() => { updateWidgetValue(nodeId, "width", s.w); updateWidgetValue(nodeId, "height", s.h); }}>{s.l}</button>
          ))}
        </div>
        <div className="props-aspect-row" style={{ marginTop: 4 }}>
          <button className="props-aspect-btn" onClick={() => {
            updateWidgetValue(nodeId, "width", Math.min(4096, width * 2));
            updateWidgetValue(nodeId, "height", Math.min(4096, height * 2));
          }}>x2</button>
          <button className="props-aspect-btn" onClick={() => {
            updateWidgetValue(nodeId, "width", Math.max(64, Math.round(width / 2)));
            updateWidgetValue(nodeId, "height", Math.max(64, Math.round(height / 2)));
          }}>÷2</button>
        </div>
      </div>
      <div className="props-section">
        <div className="props-section-title">Seed</div>
        <input className="props-input" type="text" value={seed} placeholder="Random"
          onChange={(e) => updateWidgetValue(nodeId, "seed", e.target.value)} />
      </div>
      <details className="props-section props-temp-section">
        <summary className="props-temp-header">Advanced <span className="props-temp-badge">PRO</span></summary>
        <div className="props-section">
          <div className="props-section-title">Negative Prompt</div>
          <textarea className="props-textarea" value={negativePrompt} rows={2}
            placeholder="What to avoid..."
            onChange={(e) => updateWidgetValue(nodeId, "negativePrompt", e.target.value)} />
        </div>
        <div className="props-section">
          <div className="props-section-title">Reference Method</div>
          <select className="props-select" value={refMethod}
            onChange={(e) => updateWidgetValue(nodeId, "refMethod", e.target.value)}>
            <option value="offset">offset (default)</option>
            <option value="index">index</option>
            <option value="index_timestep_zero">index_timestep_zero (KV cache)</option>
          </select>
        </div>
        <div className="props-section">
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={kvCache}
              onChange={(e) => updateWidgetValue(nodeId, "kvCache", e.target.checked)} />
            <span className="props-section-title" style={{ margin: 0 }}>KV Cache</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>faster with many refs</span>
          </label>
        </div>
        <div className="props-section">
          <div className="props-section-title">Sampler</div>
          <select className="props-select" value={sampler}
            onChange={(e) => updateWidgetValue(nodeId, "sampler", e.target.value)}>
            {["euler", "dpmpp_2m", "dpmpp_2m_sde", "dpmpp_3m_sde", "uni_pc"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="props-section">
          <div className="props-section-title">Scheduler</div>
          <select className="props-select" value={scheduler}
            onChange={(e) => updateWidgetValue(nodeId, "scheduler", e.target.value)}>
            {["simple", "normal", "karras", "sgm_uniform"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </details>
    </>
  );
}

export default Img2ImgProperties;
