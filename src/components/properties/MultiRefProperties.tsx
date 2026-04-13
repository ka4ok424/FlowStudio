import { useWorkflowStore } from "../../store/workflowStore";

// ── Multi Reference Properties ────────────────────────────────────
function MultiRefProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);

  const width = data.widgetValues?.width ?? 1024;
  const height = data.widgetValues?.height ?? 1024;
  const steps = data.widgetValues?.steps ?? 4;
  const cfg = data.widgetValues?.cfg ?? 1.5;
  const ipWeight = data.widgetValues?.ipWeight ?? 0.35;
  const styleWeight = data.widgetValues?.styleWeight ?? 0.3;

  return (
    <>
      <div className="props-section">
        <div className="props-info-row">
          <span className="props-info-label">Model</span>
          <span className="props-info-value">SDXL Lightning 4-step</span>
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Size</div>
        <div className="props-input-row">
          <input type="number" className="props-input" value={width} min={64} max={2048} step={64}
            onChange={(e) => updateWidgetValue(nodeId, "width", e.target.value === "" ? "" : parseInt(e.target.value) || "")}
            onBlur={(e) => { if (!e.target.value) updateWidgetValue(nodeId, "width", 1024); }} />
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>×</span>
          <input type="number" className="props-input" value={height} min={64} max={2048} step={64}
            onChange={(e) => updateWidgetValue(nodeId, "height", parseInt(e.target.value) || 1024)} />
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Steps</div>
        <div className="props-slider-row">
          <input type="range" className="props-slider" min={1} max={50} value={steps}
            onChange={(e) => updateWidgetValue(nodeId, "steps", parseInt(e.target.value))} />
          <span className="props-slider-value">{steps}</span>
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">CFG Scale</div>
        <div className="props-slider-row">
          <input type="range" className="props-slider" min={1} max={20} step={0.5} value={cfg}
            onChange={(e) => updateWidgetValue(nodeId, "cfg", parseFloat(e.target.value))} />
          <span className="props-slider-value">{cfg}</span>
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Reference Weight</div>
        <div className="props-slider-row">
          <input type="range" className="props-slider" min={0} max={1} step={0.05} value={ipWeight}
            onChange={(e) => updateWidgetValue(nodeId, "ipWeight", parseFloat(e.target.value))} />
          <span className="props-slider-value">{ipWeight}</span>
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Style Weight</div>
        <div className="props-slider-row">
          <input type="range" className="props-slider" min={0} max={1} step={0.05} value={styleWeight}
            onChange={(e) => updateWidgetValue(nodeId, "styleWeight", parseFloat(e.target.value))} />
          <span className="props-slider-value">{styleWeight}</span>
        </div>
      </div>
    </>
  );
}

export default MultiRefProperties;
