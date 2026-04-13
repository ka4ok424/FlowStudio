import { useWorkflowStore } from "../../store/workflowStore";

// ── Video Gen Pro Properties ──────────────────────────────────────
function VideoGenProProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const model = data.widgetValues?.model || "veo-3.1-lite-generate-preview";
  const ar = data.widgetValues?.aspectRatio || "16:9";
  const duration = data.widgetValues?.duration || "";
  const resolution = data.widgetValues?.resolution || "";
  const negPrompt = data.widgetValues?.negativePrompt || "";
  const seed = data.widgetValues?.seed ?? "";
  const numVideos = data.widgetValues?.numberOfVideos || 1;

  const VEO = [
    { id: "veo-3.1-lite-generate-preview", label: "Veo 3.1 Lite" },
    { id: "veo-3.1-fast-generate-preview", label: "Veo 3.1 Fast" },
    { id: "veo-3.1-generate-preview", label: "Veo 3.1" },
    { id: "veo-3.0-fast-generate-001", label: "Veo 3 Fast" },
    { id: "veo-3.0-generate-001", label: "Veo 3" },
    { id: "veo-2.0-generate-001", label: "Veo 2" },
  ];
  const isVeo3Plus = model.includes("3.0") || model.includes("3.1");
  const isVeo31 = model.includes("3.1");

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Model</div>
        <select className="props-select" value={model}
          onChange={(e) => updateWidgetValue(nodeId, "model", e.target.value)}>
          {VEO.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>

      <div className="props-section">
        <div className="props-section-title">Aspect Ratio</div>
        <div className="props-aspect-row">
          {["16:9", "9:16"].map((a) => (
            <button key={a} className={`props-aspect-btn ${ar === a ? "active" : ""}`}
              onClick={() => updateWidgetValue(nodeId, "aspectRatio", a)}>{a}</button>
          ))}
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Duration</div>
        <div className="props-aspect-row">
          {["4", "6", "8"].map((d) => (
            <button key={d} className={`props-aspect-btn ${duration === d ? "active" : ""}`}
              onClick={() => updateWidgetValue(nodeId, "duration", duration === d ? "" : d)}>{d}s</button>
          ))}
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Resolution</div>
        <div className="props-aspect-row">
          {["720p", "1080p", ...(isVeo31 ? ["4k"] : [])].map((r) => (
            <button key={r} className={`props-aspect-btn ${resolution === r ? "active" : ""}`}
              onClick={() => updateWidgetValue(nodeId, "resolution", resolution === r ? "" : r)}>{r}</button>
          ))}
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Negative Prompt</div>
        <textarea className="props-textarea" value={negPrompt} rows={2}
          onChange={(e) => updateWidgetValue(nodeId, "negativePrompt", e.target.value)}
          placeholder="What to avoid: blur, text, watermark..." />
      </div>

      {isVeo3Plus && (
        <div className="props-section">
          <div className="props-section-title">Seed</div>
          <div className="props-input-row">
            <input type="number" className="props-input" value={seed} placeholder="Random"
              onChange={(e) => updateWidgetValue(nodeId, "seed", e.target.value)} />
            <button className="props-dice-btn"
              onClick={() => updateWidgetValue(nodeId, "seed", Math.floor(Math.random() * 4294967295).toString())}>🎲</button>
          </div>
        </div>
      )}

      <div className="props-section">
        <div className="props-section-title">Number of Videos</div>
        <div className="props-slider-row">
          <input type="range" className="props-slider" min={1} max={isVeo3Plus ? 4 : 2} value={numVideos}
            onChange={(e) => updateWidgetValue(nodeId, "numberOfVideos", parseInt(e.target.value))} />
          <span className="props-slider-value">{numVideos}</span>
        </div>
      </div>

      <div className="props-section">
        <div className="props-info-row">
          <span className="props-info-label">Audio</span>
          <span className="props-info-value">{isVeo3Plus ? "Auto (always on)" : "None"}</span>
        </div>
        {isVeo31 && (
          <div className="props-info-row">
            <span className="props-info-label">Refs</span>
            <span className="props-info-value">Up to 3 images</span>
          </div>
        )}
      </div>
    </>
  );
}

export default VideoGenProProperties;
