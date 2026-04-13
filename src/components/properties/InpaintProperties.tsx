import { useWorkflowStore } from "../../store/workflowStore";

// ── Inpaint Properties ───────────────────────────────────────────
function InpaintProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const modelType = data.widgetValues?.modelType ?? "flux1-fill";
  const denoise = data.widgetValues?.denoise ?? 0.85;
  const steps = data.widgetValues?.steps ?? 8;
  const cfg = data.widgetValues?.cfg ?? 1.0;
  const seed = data.widgetValues?.seed ?? "";
  const samPrompt = data.widgetValues?.samPrompt ?? "";

  const models = [
    { value: "flux1-fill", label: "FLUX.1 Fill", desc: "Best quality, specialized inpaint model" },
    { value: "klein-9b", label: "Klein 9B", desc: "Fast, good quality" },
    { value: "klein-4b", label: "Klein 4B", desc: "Fastest FLUX, lightweight" },
    { value: "sdxl-inpaint", label: "SDXL Inpainting", desc: "Good quality, dedicated checkpoint" },
    { value: "sd15-inpaint", label: "SD 1.5 Inpainting", desc: "Fastest, lower quality" },
  ];
  const current = models.find(m => m.value === modelType);

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Model</div>
        <select className="props-select" value={modelType}
          onChange={(e) => updateWidgetValue(nodeId, "modelType", e.target.value)}>
          {models.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        {current && <p className="settings-hint" style={{ marginTop: 4 }}>{current.desc}</p>}
      </div>
      <div className="props-section">
        <div className="props-section-title">Denoise</div>
        <input type="range" className="props-range" min={0.05} max={1.0} step={0.05} value={denoise}
          onChange={(e) => updateWidgetValue(nodeId, "denoise", parseFloat(e.target.value))} />
        <span className="props-range-value">{denoise.toFixed(2)}</span>
      </div>
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
        <summary className="props-temp-header">Auto Mask (SAM) <span className="props-temp-badge">AI</span></summary>
        <div className="props-section">
          <div className="props-section-title">Object to mask</div>
          <input className="props-input" type="text" value={samPrompt} placeholder='e.g. "shirt", "background", "hat"'
            onChange={(e) => updateWidgetValue(nodeId, "samPrompt", e.target.value)} />
          <p className="settings-hint" style={{ marginTop: 4 }}>Type what to select — SAM creates mask automatically. Works without drawing.</p>
        </div>
      </details>
    </>
  );
}

export default InpaintProperties;
