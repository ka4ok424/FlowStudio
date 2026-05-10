import { useWorkflowStore } from "../../store/workflowStore";
import { getModelDefaults } from "../../workflows/localGen";
import BatchCountField from "./BatchCountField";

// ── Local Generate Properties ──────────────────────────────────────
function LocalGenProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const nodeDefs = useWorkflowStore((s) => s.nodeDefs);

  // Get image generation models from ComfyUI (filtered)
  const ALLOWED_MODELS = ["flux-2-klein-4b", "flux-2-klein-9b", "flux2_dev_fp8mixed", "flux1-dev", "z_image_turbo"];
  const checkpoints: string[] = [];
  for (const loaderName of ["UNETLoader", "UnetLoaderGGUF", "CheckpointLoaderSimple"]) {
    if (nodeDefs[loaderName]) {
      const key = loaderName.includes("UNET") || loaderName.includes("Unet") ? "unet_name" : "ckpt_name";
      const config = nodeDefs[loaderName].input?.required?.[key];
      if (config && Array.isArray(config) && Array.isArray(config[0])) {
        for (const m of config[0]) {
          if (!checkpoints.includes(m) && ALLOWED_MODELS.some(a => m.toLowerCase().includes(a.toLowerCase()))) checkpoints.push(m);
        }
      }
    }
  }

  const model = data.widgetValues?.model || checkpoints[0] || "";
  const steps = data.widgetValues?.steps ?? 4;
  const cfg = data.widgetValues?.cfg ?? 7;
  const width = data.widgetValues?.width ?? 720;
  const height = data.widgetValues?.height ?? 1280;
  const seed = data.widgetValues?.seed ?? "";
  const count = data.widgetValues?.count ?? 1;
  const recommended = getModelDefaults(model);

  const ASPECTS = [
    { w: 1024, h: 1024, l: "1:1" },
    { w: 1080, h: 1350, l: "4:5" },
    { w: 1280, h: 720,  l: "16:9" },
    { w: 720,  h: 1280, l: "9:16" },
  ];

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Checkpoint</div>
        <select className="props-select"
          value={model}
          onChange={(e) => {
            const newModel = e.target.value;
            const r = getModelDefaults(newModel);
            updateWidgetValue(nodeId, "model", newModel);
            updateWidgetValue(nodeId, "steps", r.steps);
            updateWidgetValue(nodeId, "cfg", r.cfg);
          }}>
          {checkpoints.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
          {recommended.label} — recommended: {recommended.steps} steps, CFG {recommended.cfg}
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Size</div>
        <div className="props-input-row">
          <input type="number" className="props-input" value={width} min={64} max={2048} step={64}
            onChange={(e) => updateWidgetValue(nodeId, "width", e.target.value === "" ? "" : parseInt(e.target.value) || "")}
            onBlur={(e) => {
              const n = parseInt(e.target.value);
              const snapped = !n || isNaN(n) ? 720 : Math.max(64, Math.min(2048, Math.round(n / 64) * 64));
              updateWidgetValue(nodeId, "width", snapped);
            }} />
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>×</span>
          <input type="number" className="props-input" value={height} min={64} max={2048} step={64}
            onChange={(e) => updateWidgetValue(nodeId, "height", e.target.value === "" ? "" : parseInt(e.target.value) || "")}
            onBlur={(e) => {
              const n = parseInt(e.target.value);
              const snapped = !n || isNaN(n) ? 1280 : Math.max(64, Math.min(2048, Math.round(n / 64) * 64));
              updateWidgetValue(nodeId, "height", snapped);
            }} />
        </div>
        <div className="props-aspect-row" style={{ marginTop: 8 }}>
          {ASPECTS.map((s) => (
            <button key={s.l}
              className={`props-aspect-btn ${width === s.w && height === s.h ? "active" : ""}`}
              onClick={() => {
                updateWidgetValue(nodeId, "width", s.w);
                updateWidgetValue(nodeId, "height", s.h);
              }}>{s.l}</button>
          ))}
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">
          Steps
          {steps !== recommended.steps && (
            <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 6, fontWeight: 400 }}>
              (recommended {recommended.steps})
            </span>
          )}
        </div>
        <div className="props-slider-row">
          <input type="range" className="props-slider" min={1} max={50} value={steps}
            onChange={(e) => updateWidgetValue(nodeId, "steps", parseInt(e.target.value))} />
          <span className="props-slider-value">{steps}</span>
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">
          CFG Scale
          {cfg !== recommended.cfg && (
            <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 6, fontWeight: 400 }}>
              (recommended {recommended.cfg})
            </span>
          )}
        </div>
        <div className="props-slider-row">
          <input type="range" className="props-slider" min={1} max={20} step={0.5} value={cfg}
            onChange={(e) => updateWidgetValue(nodeId, "cfg", parseFloat(e.target.value))} />
          <span className="props-slider-value">{cfg}</span>
        </div>
      </div>

      <BatchCountField nodeId={nodeId} value={count} />

      <div className="props-section">
        <div className="props-section-title">Seed</div>
        <div className="props-input-row">
          <input type="number" className="props-input" value={seed} placeholder="Random"
            onChange={(e) => updateWidgetValue(nodeId, "seed", e.target.value)} />
          <button className="props-dice-btn"
            onClick={() => updateWidgetValue(nodeId, "seed", Math.floor(Math.random() * 2147483647).toString())}>🎲</button>
        </div>
      </div>
    </>
  );
}

export default LocalGenProperties;
