import { useWorkflowStore } from "../../store/workflowStore";

function HunyuanAvatarProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const steps = data.widgetValues?.steps ?? 25;
  const cfg = data.widgetValues?.cfg ?? 7.5;
  const width = data.widgetValues?.width ?? 512;
  const height = data.widgetValues?.height ?? 512;
  const videoLength = data.widgetValues?.videoLength ?? 128;
  const fps = data.widgetValues?.fps ?? 25.0;
  const duration = data.widgetValues?.duration ?? 5.0;
  const faceSize = data.widgetValues?.faceSize ?? 3.0;
  const imageSize = data.widgetValues?.imageSize ?? 704;
  const objectName = data.widgetValues?.objectName ?? "person";
  const seed = data.widgetValues?.seed ?? "";
  const negativePrompt = data.widgetValues?.negativePrompt ?? "";
  const prompt = data.widgetValues?.prompt ?? "";

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Scene Prompt</div>
        <textarea className="props-textarea" value={prompt} rows={2} placeholder="Describe the scene..."
          onChange={(e) => updateWidgetValue(nodeId, "prompt", e.target.value)} />
      </div>
      <div className="props-section">
        <div className="props-section-title">Object Name</div>
        <input className="props-input" type="text" value={objectName}
          onChange={(e) => updateWidgetValue(nodeId, "objectName", e.target.value)} />
      </div>
      <div className="props-section">
        <div className="props-section-title">Duration (sec)</div>
        <input type="range" className="props-range" min={1} max={30} step={0.5} value={duration}
          onChange={(e) => updateWidgetValue(nodeId, "duration", parseFloat(e.target.value))} />
        <span className="props-range-value">{duration.toFixed(1)}s</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">Size</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input className="props-input" type="number" value={width} min={128} max={1216} step={64}
            onChange={(e) => updateWidgetValue(nodeId, "width", parseInt(e.target.value))} style={{ width: "50%" }} />
          <span style={{ color: "var(--text-muted)", alignSelf: "center" }}>x</span>
          <input className="props-input" type="number" value={height} min={128} max={1216} step={64}
            onChange={(e) => updateWidgetValue(nodeId, "height", parseInt(e.target.value))} style={{ width: "50%" }} />
        </div>
        <div className="props-aspect-row" style={{ marginTop: 10 }}>
          {[{w:512,h:512,l:"1:1"},{w:512,h:768,l:"2:3"},{w:768,h:512,l:"3:2"}].map((s) => (
            <button key={s.l} className={`props-aspect-btn ${width === s.w && height === s.h ? "active" : ""}`}
              onClick={() => { updateWidgetValue(nodeId, "width", s.w); updateWidgetValue(nodeId, "height", s.h); }}>{s.l}</button>
          ))}
        </div>
      </div>
      <div className="props-section">
        <div className="props-section-title">Steps</div>
        <input type="range" className="props-range" min={10} max={50} step={1} value={steps}
          onChange={(e) => updateWidgetValue(nodeId, "steps", parseInt(e.target.value))} />
        <span className="props-range-value">{steps}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">CFG</div>
        <input type="range" className="props-range" min={1} max={15} step={0.5} value={cfg}
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
        <summary className="props-temp-header">Advanced <span className="props-temp-badge">PRO</span></summary>
        <div className="props-section">
          <div className="props-section-title">Negative Prompt</div>
          <textarea className="props-textarea" value={negativePrompt} rows={2} placeholder="What to avoid..."
            onChange={(e) => updateWidgetValue(nodeId, "negativePrompt", e.target.value)} />
        </div>
        <div className="props-section">
          <div className="props-section-title">Face Size</div>
          <input type="range" className="props-range" min={0.5} max={10} step={0.1} value={faceSize}
            onChange={(e) => updateWidgetValue(nodeId, "faceSize", parseFloat(e.target.value))} />
          <span className="props-range-value">{faceSize.toFixed(1)}</span>
        </div>
        <div className="props-section">
          <div className="props-section-title">Image Size</div>
          <input type="range" className="props-range" min={128} max={1216} step={64} value={imageSize}
            onChange={(e) => updateWidgetValue(nodeId, "imageSize", parseInt(e.target.value))} />
          <span className="props-range-value">{imageSize}</span>
        </div>
        <div className="props-section">
          <div className="props-section-title">Video Length (frames)</div>
          <input type="range" className="props-range" min={128} max={512} step={4} value={videoLength}
            onChange={(e) => updateWidgetValue(nodeId, "videoLength", parseInt(e.target.value))} />
          <span className="props-range-value">{videoLength}</span>
        </div>
        <div className="props-section">
          <div className="props-section-title">FPS</div>
          <div style={{ display: "flex", gap: 4 }}>
            <button className={`props-aspect-btn ${fps === 25.0 ? "active" : ""}`} style={{ flex: 1 }}
              onClick={() => updateWidgetValue(nodeId, "fps", 25.0)}>25</button>
            <button className={`props-aspect-btn ${fps === 12.5 ? "active" : ""}`} style={{ flex: 1 }}
              onClick={() => updateWidgetValue(nodeId, "fps", 12.5)}>12.5</button>
          </div>
        </div>
      </details>
    </>
  );
}

export default HunyuanAvatarProperties;
