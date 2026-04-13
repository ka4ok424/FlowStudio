import { useWorkflowStore } from "../../store/workflowStore";

// ── Kontext Properties ───────────────────────────────────────────
function KontextProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const steps = data.widgetValues?.steps ?? 24;
  const cfg = data.widgetValues?.cfg ?? 3.5;
  const seed = data.widgetValues?.seed ?? "";
  const sampler = data.widgetValues?.sampler ?? "euler";
  const scheduler = data.widgetValues?.scheduler ?? "simple";

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Steps</div>
        <input type="range" className="props-range" min={1} max={30} step={1} value={steps}
          onChange={(e) => updateWidgetValue(nodeId, "steps", parseInt(e.target.value))} />
        <span className="props-range-value">{steps}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">CFG</div>
        <input type="range" className="props-range" min={1} max={20} step={0.5} value={cfg}
          onChange={(e) => updateWidgetValue(nodeId, "cfg", parseFloat(e.target.value))} />
        <span className="props-range-value">{cfg}</span>
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

export default KontextProperties;
