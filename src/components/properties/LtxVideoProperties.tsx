import { useWorkflowStore } from "../../store/workflowStore";

// ── LTX Video Properties ─────────────────────────────────────────
function LtxVideoProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const steps = data.widgetValues?.steps ?? 8;
  const cfg = data.widgetValues?.cfg ?? 1.0;
  const width = data.widgetValues?.width ?? 720;
  const height = data.widgetValues?.height ?? 1280;
  const frames = data.widgetValues?.frames ?? 97;
  const fps = data.widgetValues?.fps ?? 24;
  const seed = data.widgetValues?.seed ?? "";
  const negativePrompt = data.widgetValues?.negativePrompt ?? "";
  const stg = data.widgetValues?.stg ?? 0.6;
  const maxShift = data.widgetValues?.maxShift ?? 0.6;
  const baseShift = data.widgetValues?.baseShift ?? 0.6;
  const frameStrength = data.widgetValues?.frameStrength ?? 1;
  const maxLength = data.widgetValues?.maxLength ?? 512;
  const spatialUpscale = !!data.widgetValues?.spatialUpscale;
  const temporalUpscale = !!data.widgetValues?.temporalUpscale;
  const temporalStartSigma = data.widgetValues?.temporalStartSigma ?? 0.4;

  const outputW = spatialUpscale ? width * 2 : width;
  const outputH = spatialUpscale ? height * 2 : height;
  const outputFps = temporalUpscale ? fps * 2 : fps;
  const outputFrames = temporalUpscale ? frames * 2 : frames;

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Frames ({(frames / fps).toFixed(1)}s at {fps}fps)</div>
        <input type="range" className="props-range" min={25} max={481} step={8} value={frames}
          onChange={(e) => updateWidgetValue(nodeId, "frames", parseInt(e.target.value))} />
        <span className="props-range-value">{frames}</span>
        {frames > 121 && temporalUpscale && (
          <p className="settings-hint" style={{ fontSize: 11, color: "#f59e0b", marginTop: 4, lineHeight: 1.4 }}>
            ⚠ Temporal x2 may produce ghosting on clips &gt;121 frames. Use Smooth FPS node instead.
          </p>
        )}
        {frames > 193 && (
          <p className="settings-hint" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4 }}>
            Long clips (&gt;8s): Stage 1 ~proportionally longer. 481 frames ≈ 20s @ 24fps (LTX max).
          </p>
        )}
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
            onBlur={() => { if (!width || isNaN(width)) updateWidgetValue(nodeId, "width", 720); }} style={{ width: "50%" }} />
          <span style={{ color: "var(--text-muted)", alignSelf: "center" }}>x</span>
          <input className="props-input" type="number" value={height ?? ""} min={64} max={2048}
            onChange={(e) => updateWidgetValue(nodeId, "height", e.target.value === "" ? "" : Math.min(2048, parseInt(e.target.value)))}
            onBlur={() => { if (!height || isNaN(height)) updateWidgetValue(nodeId, "height", 1280); }} style={{ width: "50%" }} />
        </div>
        <div className="props-aspect-row" style={{ marginTop: 10 }}>
          {[
            {w:512,h:512,l:"1:1"},
            {w:768,h:512,l:"3:2"},
            {w:512,h:768,l:"2:3"},
            {w:1280,h:720,l:"16:9"},
            {w:720,h:1280,l:"9:16"},
          ].map((s) => (
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
        <input type="range" className="props-range" min={4} max={50} step={1} value={steps}
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

      <div className="props-section">
        <div className="props-section-title">Upscaling</div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer" }}>
          <input type="checkbox" checked={spatialUpscale}
            onChange={(e) => updateWidgetValue(nodeId, "spatialUpscale", e.target.checked)} />
          <span>Spatial 2× <span style={{ color: "var(--text-muted)", fontSize: 11 }}>(resolution)</span></span>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer" }}>
          <input type="checkbox" checked={temporalUpscale}
            onChange={(e) => updateWidgetValue(nodeId, "temporalUpscale", e.target.checked)} />
          <span>Temporal 2× <span style={{ color: "var(--text-muted)", fontSize: 11 }}>(smoother motion)</span></span>
        </label>
        {(spatialUpscale || temporalUpscale) && (
          <p className="settings-hint" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.4 }}>
            Output: {outputW}×{outputH} · {outputFrames} frames @ {outputFps}fps
            ({(outputFrames / outputFps).toFixed(1)}s)
            <br />Generation time roughly +30–50% per enabled stage.
          </p>
        )}
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
        {temporalUpscale && (
          <div className="props-section">
            <div className="props-section-title">
              Temporal Strength <span style={{ color: "#f59e0b", fontWeight: 400, fontSize: 10 }}>(sigma temporarily disabled)</span>
            </div>
            <input type="range" className="props-range" min={0.05} max={1} step={0.05} value={temporalStartSigma}
              onChange={(e) => updateWidgetValue(nodeId, "temporalStartSigma", parseFloat(e.target.value))} />
            <span className="props-range-value">{temporalStartSigma.toFixed(2)}</span>
            <p className="settings-hint" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4 }}>
              Starting sigma for temporal refinement (default 0.4). Lower = preserves character identity from Stage 1. Higher = more "creative" interpolation but faces may drift. Lightricks original = 0.85.
            </p>
          </div>
        )}
      </details>
    </>
  );
}

export default LtxVideoProperties;
