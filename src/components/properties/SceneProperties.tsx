import { useWorkflowStore } from "../../store/workflowStore";

// ── Scene Properties ──────────────────────────────────────────────
function SceneProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const nodeDefs = useWorkflowStore((s) => s.nodeDefs);

  const sceneTitle = data.widgetValues?.sceneTitle || "";
  const action = data.widgetValues?.action || "";
  const model = data.widgetValues?.model || "";
  const width = data.widgetValues?.width ?? 1024;
  const height = data.widgetValues?.height ?? 576;
  const steps = data.widgetValues?.steps ?? 4;
  const cfg = data.widgetValues?.cfg ?? 7;
  const previewUrl = data.widgetValues?._previewUrl || null;

  const checkpoints: string[] = [];
  for (const loaderName of ["UNETLoader", "UnetLoaderGGUF", "CheckpointLoaderSimple"]) {
    if (nodeDefs[loaderName]) {
      const key = loaderName.includes("UNET") || loaderName.includes("Unet") ? "unet_name" : "ckpt_name";
      const config = nodeDefs[loaderName].input?.required?.[key];
      if (config && Array.isArray(config) && Array.isArray(config[0])) {
        for (const m of config[0]) {
          if (!checkpoints.includes(m)) checkpoints.push(m);
        }
      }
    }
  }

  return (
    <>
      {previewUrl && (
        <div className="props-preview">
          <img src={previewUrl} alt="" />
        </div>
      )}

      <div className="props-section">
        <div className="props-section-title">Scene Title</div>
        <input type="text" className="props-input" value={sceneTitle}
          onChange={(e) => updateWidgetValue(nodeId, "sceneTitle", e.target.value)}
          placeholder="Scene title..." />
      </div>

      <div className="props-section">
        <div className="props-section-title">Action</div>
        <textarea className="props-textarea" value={action} rows={3}
          onChange={(e) => updateWidgetValue(nodeId, "action", e.target.value)}
          placeholder="What happens in this scene..." />
      </div>

      <div className="props-section">
        <div className="props-section-title">Model</div>
        <select className="props-select" value={model}
          onChange={(e) => updateWidgetValue(nodeId, "model", e.target.value)}>
          {checkpoints.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="props-section">
        <div className="props-section-title">Size</div>
        <div className="props-input-row">
          <input type="number" className="props-input" value={width} min={64} max={2048} step={64}
            onChange={(e) => updateWidgetValue(nodeId, "width", e.target.value === "" ? "" : parseInt(e.target.value) || "")}
            onBlur={(e) => { if (!e.target.value) updateWidgetValue(nodeId, "width", 1024); }} />
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>×</span>
          <input type="number" className="props-input" value={height} min={64} max={2048} step={64}
            onChange={(e) => updateWidgetValue(nodeId, "height", e.target.value === "" ? "" : parseInt(e.target.value) || "")}
            onBlur={(e) => { if (!e.target.value) updateWidgetValue(nodeId, "height", 576); }} />
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
    </>
  );
}

export default SceneProperties;
