import { useWorkflowStore } from "../../store/workflowStore";

const CONTROL_TYPES = [
  { value: "canny", label: "Canny (edges)" },
  { value: "soft_edge", label: "Soft Edge" },
  { value: "depth", label: "Depth" },
  { value: "pose", label: "Pose" },
  { value: "gray", label: "Gray (style)" },
];

function InpaintCNProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const controlType = data.widgetValues?.controlType ?? "canny";
  const cnStrength = data.widgetValues?.cnStrength ?? 0.5;
  const cnStartPercent = data.widgetValues?.cnStartPercent ?? 0.0;
  const cnEndPercent = data.widgetValues?.cnEndPercent ?? 0.8;
  const steps = data.widgetValues?.steps ?? 20;
  const guidance = data.widgetValues?.guidance ?? 30;
  const denoise = data.widgetValues?.denoise ?? 0.85;
  const seed = data.widgetValues?.seed ?? "";
  const cannyLow = data.widgetValues?.cannyLow ?? 0.4;
  const cannyHigh = data.widgetValues?.cannyHigh ?? 0.8;
  const samPrompt = data.widgetValues?.samPrompt ?? "";

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Control Type</div>
        <select className="props-select" value={controlType}
          onChange={(e) => updateWidgetValue(nodeId, "controlType", e.target.value)}>
          {CONTROL_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div className="props-section">
        <div className="props-section-title">CN Strength</div>
        <input type="range" className="props-range" min={0.05} max={1.5} step={0.05} value={cnStrength}
          onChange={(e) => updateWidgetValue(nodeId, "cnStrength", parseFloat(e.target.value))} />
        <span className="props-range-value">{cnStrength.toFixed(2)}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">CN Start %</div>
        <input type="range" className="props-range" min={0} max={1} step={0.05} value={cnStartPercent}
          onChange={(e) => updateWidgetValue(nodeId, "cnStartPercent", parseFloat(e.target.value))} />
        <span className="props-range-value">{cnStartPercent.toFixed(2)}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">CN End %</div>
        <input type="range" className="props-range" min={0} max={1} step={0.05} value={cnEndPercent}
          onChange={(e) => updateWidgetValue(nodeId, "cnEndPercent", parseFloat(e.target.value))} />
        <span className="props-range-value">{cnEndPercent.toFixed(2)}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">Denoise</div>
        <input type="range" className="props-range" min={0.05} max={1.0} step={0.05} value={denoise}
          onChange={(e) => updateWidgetValue(nodeId, "denoise", parseFloat(e.target.value))} />
        <span className="props-range-value">{denoise.toFixed(2)}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">Steps</div>
        <input type="range" className="props-range" min={1} max={50} step={1} value={steps}
          onChange={(e) => updateWidgetValue(nodeId, "steps", parseInt(e.target.value))} />
        <span className="props-range-value">{steps}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">CFG</div>
        <input type="range" className="props-range" min={1} max={10} step={0.5} value={guidance}
          onChange={(e) => updateWidgetValue(nodeId, "guidance", parseFloat(e.target.value))} />
        <span className="props-range-value">{guidance.toFixed(1)}</span>
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
      {controlType === "canny" && (
        <details className="props-section props-temp-section" open>
          <summary className="props-temp-header">Canny Thresholds</summary>
          <div className="props-section">
            <div className="props-section-title">Low</div>
            <input type="range" className="props-range" min={0.01} max={0.99} step={0.01} value={cannyLow}
              onChange={(e) => updateWidgetValue(nodeId, "cannyLow", parseFloat(e.target.value))} />
            <span className="props-range-value">{cannyLow.toFixed(2)}</span>
          </div>
          <div className="props-section">
            <div className="props-section-title">High</div>
            <input type="range" className="props-range" min={0.01} max={0.99} step={0.01} value={cannyHigh}
              onChange={(e) => updateWidgetValue(nodeId, "cannyHigh", parseFloat(e.target.value))} />
            <span className="props-range-value">{cannyHigh.toFixed(2)}</span>
          </div>
        </details>
      )}
      <details className="props-section props-temp-section">
        <summary className="props-temp-header">Auto Mask (SAM) <span className="props-temp-badge">AI</span></summary>
        <div className="props-section">
          <div className="props-section-title">Object to mask</div>
          <input className="props-input" type="text" value={samPrompt} placeholder='e.g. "ball", "background"'
            onChange={(e) => updateWidgetValue(nodeId, "samPrompt", e.target.value)} />
          <p className="settings-hint" style={{ marginTop: 4 }}>SAM auto-masks the object. No drawing needed.</p>
        </div>
      </details>
    </>
  );
}

export default InpaintCNProperties;
