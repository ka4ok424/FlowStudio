import { useWorkflowStore } from "../../store/workflowStore";
import BatchCountField from "./BatchCountField";

const CONTROL_TYPES = [
  { value: "canny", label: "Canny (edges)" },
  { value: "soft_edge", label: "Soft Edge" },
  { value: "depth", label: "Depth" },
  { value: "pose", label: "Pose" },
  { value: "gray", label: "Gray (style)" },
];

function ControlNetProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const controlType = data.widgetValues?.controlType ?? "canny";
  const strength = data.widgetValues?.strength ?? 0.7;
  const startPercent = data.widgetValues?.startPercent ?? 0.0;
  const endPercent = data.widgetValues?.endPercent ?? 1.0;
  const steps = data.widgetValues?.steps ?? 20;
  const cfg = data.widgetValues?.cfg ?? 3.5;
  const width = data.widgetValues?.width ?? 1024;
  const height = data.widgetValues?.height ?? 1024;
  const seed = data.widgetValues?.seed ?? "";
  const cannyLow = data.widgetValues?.cannyLow ?? 0.4;
  const cannyHigh = data.widgetValues?.cannyHigh ?? 0.8;
  const count = data.widgetValues?.count ?? 1;

  return (
    <>
      <BatchCountField nodeId={nodeId} value={count} />
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
        <div className="props-section-title">Strength</div>
        <input type="range" className="props-range" min={0.05} max={1.5} step={0.05} value={strength}
          onChange={(e) => updateWidgetValue(nodeId, "strength", parseFloat(e.target.value))} />
        <span className="props-range-value">{strength.toFixed(2)}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">Start %</div>
        <input type="range" className="props-range" min={0} max={1} step={0.05} value={startPercent}
          onChange={(e) => updateWidgetValue(nodeId, "startPercent", parseFloat(e.target.value))} />
        <span className="props-range-value">{startPercent.toFixed(2)}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">End %</div>
        <input type="range" className="props-range" min={0} max={1} step={0.05} value={endPercent}
          onChange={(e) => updateWidgetValue(nodeId, "endPercent", parseFloat(e.target.value))} />
        <span className="props-range-value">{endPercent.toFixed(2)}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">Steps</div>
        <input type="range" className="props-range" min={1} max={50} step={1} value={steps}
          onChange={(e) => updateWidgetValue(nodeId, "steps", parseInt(e.target.value))} />
        <span className="props-range-value">{steps}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">CFG</div>
        <input type="range" className="props-range" min={1} max={10} step={0.5} value={cfg}
          onChange={(e) => updateWidgetValue(nodeId, "cfg", parseFloat(e.target.value))} />
        <span className="props-range-value">{cfg.toFixed(1)}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">Size</div>
        <div className="props-input-row">
          <input type="number" className="props-input" value={width} style={{ width: 70 }}
            onChange={(e) => updateWidgetValue(nodeId, "width", e.target.value === "" ? "" : parseInt(e.target.value))}
            onBlur={(e) => { if (!e.target.value) updateWidgetValue(nodeId, "width", 1024); }} />
          <span style={{ color: "var(--text-muted)" }}>x</span>
          <input type="number" className="props-input" value={height} style={{ width: 70 }}
            onChange={(e) => updateWidgetValue(nodeId, "height", e.target.value === "" ? "" : parseInt(e.target.value))}
            onBlur={(e) => { if (!e.target.value) updateWidgetValue(nodeId, "height", 1024); }} />
        </div>
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
    </>
  );
}

export default ControlNetProperties;
