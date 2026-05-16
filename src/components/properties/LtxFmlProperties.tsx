import { useWorkflowStore } from "../../store/workflowStore";

const ASPECT_PRESETS = [
  { w: 512,  h: 512,  l: "1:1"  },
  { w: 1080, h: 1350, l: "4:5"  },
  { w: 1280, h: 720,  l: "16:9" },
  { w: 720,  h: 1280, l: "9:16" },
];

// 5s default = 121 frames @ 24fps; 20s max = 481 frames (workflow's frame
// calculator rounds to 8n+1).
const DEFAULT_FRAMES = 121;
const MAX_FRAMES = 481;

function LtxFmlProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);

  const frames = data.widgetValues?.frames ?? DEFAULT_FRAMES;
  const fps = data.widgetValues?.fps ?? 24;
  const width  = data.widgetValues?.width  ?? 720;
  const height = data.widgetValues?.height ?? 1280;
  const cfg = data.widgetValues?.cfg ?? 1.0;
  const steps = data.widgetValues?.steps ?? 8;
  const seed = data.widgetValues?.seed ?? "";
  const firstFrameStrength = data.widgetValues?.firstFrameStrength ?? 0.7;
  const middleFrameStrength = data.widgetValues?.middleFrameStrength ?? 0.3;
  const lastFrameStrength  = data.widgetValues?.lastFrameStrength  ?? 1.0;
  const promptEnhancer = data.widgetValues?.promptEnhancer ?? false;

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Length ({(frames / fps).toFixed(1)}s at {fps}fps)</div>
        <input type="range" className="props-range" min={25} max={MAX_FRAMES} step={8} value={frames}
          onChange={(e) => updateWidgetValue(nodeId, "frames", parseInt(e.target.value))} />
        <span className="props-range-value">{frames} frames</span>
      </div>

      <div className="props-section">
        <div className="props-section-title">FPS</div>
        <input type="range" className="props-range" min={12} max={30} step={1} value={fps}
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
          {ASPECT_PRESETS.map((s) => (
            <button key={s.l} className={`props-aspect-btn ${width === s.w && height === s.h ? "active" : ""}`}
              onClick={() => { updateWidgetValue(nodeId, "width", s.w); updateWidgetValue(nodeId, "height", s.h); }}>{s.l}</button>
          ))}
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">CFG</div>
        <input type="range" className="props-range" min={1} max={6} step={0.1} value={cfg}
          onChange={(e) => updateWidgetValue(nodeId, "cfg", parseFloat(e.target.value))} />
        <span className="props-range-value">{cfg.toFixed(1)}</span>
      </div>

      <div className="props-section">
        <div className="props-section-title">Steps</div>
        <input type="range" className="props-range" min={4} max={32} step={1} value={steps}
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
        <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer" }}>
          <input type="checkbox" checked={promptEnhancer}
            onChange={(e) => updateWidgetValue(nodeId, "promptEnhancer", e.target.checked)} />
          <span>Prompt Enhancer <span style={{ color: "var(--text-muted)", fontSize: 11 }}>(LTX-2 auto-enhance)</span></span>
        </label>
      </div>

      <div className="props-section">
        <div className="props-section-title">First Frame Strength</div>
        <input type="range" className="props-range" min={0} max={1.5} step={0.05} value={firstFrameStrength}
          onChange={(e) => updateWidgetValue(nodeId, "firstFrameStrength", parseFloat(e.target.value))} />
        <span className="props-range-value">{firstFrameStrength.toFixed(2)}</span>
      </div>

      <div className="props-section">
        <div className="props-section-title">Middle Frame Strength</div>
        <input type="range" className="props-range" min={0} max={1.5} step={0.05} value={middleFrameStrength}
          onChange={(e) => updateWidgetValue(nodeId, "middleFrameStrength", parseFloat(e.target.value))} />
        <span className="props-range-value">{middleFrameStrength.toFixed(2)}</span>
      </div>

      <div className="props-section">
        <div className="props-section-title">Last Frame Strength</div>
        <input type="range" className="props-range" min={0} max={1.5} step={0.05} value={lastFrameStrength}
          onChange={(e) => updateWidgetValue(nodeId, "lastFrameStrength", parseFloat(e.target.value))} />
        <span className="props-range-value">{lastFrameStrength.toFixed(2)}</span>
      </div>
    </>
  );
}

export default LtxFmlProperties;
