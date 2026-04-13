import { useWorkflowStore } from "../../store/workflowStore";

// ── Nano Banana Properties ─────────────────────────────────────────
function NanoBananaProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const aspectRatio = data.widgetValues?.aspectRatio || "1:1";
  const seed = data.widgetValues?.seed ?? "";
  const temperature = data.widgetValues?.temperature ?? 1.0;
  const numImages = data.widgetValues?.numImages ?? 1;

  const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"];

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Aspect Ratio</div>
        <div className="props-aspect-row">
          {ASPECT_RATIOS.map((ar) => (
            <button
              key={ar}
              className={`props-aspect-btn ${aspectRatio === ar ? "active" : ""}`}
              onClick={() => updateWidgetValue(nodeId, "aspectRatio", ar)}
            >
              {ar}
            </button>
          ))}
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Seed</div>
        <div className="props-input-row">
          <input
            type="number"
            value={seed}
            onChange={(e) => updateWidgetValue(nodeId, "seed", e.target.value)}
            placeholder="Random"
            className="props-input"
          />
          <button
            className="props-dice-btn"
            onClick={() => updateWidgetValue(nodeId, "seed", Math.floor(Math.random() * 2147483647).toString())}
            title="Random seed"
          >
            🎲
          </button>
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Temperature</div>
        <div className="props-slider-row">
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) => updateWidgetValue(nodeId, "temperature", parseFloat(e.target.value))}
            className="props-slider"
          />
          <span className="props-slider-value">{temperature}</span>
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Number of Images</div>
        <div className="props-input-row">
          <input
            type="number"
            min="1"
            max="4"
            value={numImages}
            onChange={(e) => updateWidgetValue(nodeId, "numImages", parseInt(e.target.value) || 1)}
            className="props-input"
          />
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Model</div>
        <select
          className="props-select"
          value={data.widgetValues?.model || "gemini-2.5-flash-image"}
          onChange={(e) => updateWidgetValue(nodeId, "model", e.target.value)}
        >
          <option value="gemini-2.5-flash-image">gemini-2.5-flash-image</option>
          <option value="gemini-3.1-flash-image-preview">gemini-3.1-flash-image-preview</option>
          <option value="nano-banana-pro-preview">nano-banana-pro-preview</option>
        </select>
      </div>

      {/* TEMP: Safety settings */}
      <details className="props-section props-temp-section">
        <summary className="props-temp-header">Safety Settings <span className="props-temp-badge">TEMP</span></summary>

        {[
          { key: "safety_harassment", label: "Harassment" },
          { key: "safety_hate", label: "Hate Speech" },
          { key: "safety_sexual", label: "Sexually Explicit" },
          { key: "safety_dangerous", label: "Dangerous Content" },
        ].map(({ key, label }) => (
          <div key={key} className="props-safety-row">
            <span className="props-safety-label">{label}</span>
            <select
              className="props-safety-select"
              value={data.widgetValues?.[key] || "BLOCK_MEDIUM_AND_ABOVE"}
              onChange={(e) => updateWidgetValue(nodeId, key, e.target.value)}
            >
              <option value="BLOCK_NONE">Off</option>
              <option value="BLOCK_ONLY_HIGH">Low</option>
              <option value="BLOCK_MEDIUM_AND_ABOVE">Medium</option>
              <option value="BLOCK_LOW_AND_ABOVE">High</option>
            </select>
          </div>
        ))}
      </details>
    </>
  );
}

export default NanoBananaProperties;
