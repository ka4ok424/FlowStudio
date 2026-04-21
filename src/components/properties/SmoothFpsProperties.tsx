import { useWorkflowStore } from "../../store/workflowStore";

const RIFE_MODELS = [
  { value: "rife49.pth", label: "RIFE 4.9 (default, quality)" },
  { value: "rife47.pth", label: "RIFE 4.7 (balanced)" },
  { value: "rife417.pth", label: "RIFE 4.17 (newer)" },
  { value: "rife426.pth", label: "RIFE 4.26 (latest)" },
];

function SmoothFpsProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const update = useWorkflowStore((s) => s.updateWidgetValue);
  const wv = data.widgetValues || {};
  const v = <T,>(k: string, d: T): T => (wv[k] !== undefined ? wv[k] : d);

  const multiplier = v("multiplier", 2) as number;
  const model = v("model", "rife49.pth") as string;
  const sourceFps = v("sourceFps", 24) as number;
  const fastMode = v("fastMode", true) as boolean;
  const ensemble = v("ensemble", true) as boolean;

  const outputFps = sourceFps * multiplier;

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Multiplier</div>
        <div className="props-aspect-row">
          {[2, 3, 4].map((m) => (
            <button
              key={m}
              className={`props-aspect-btn ${multiplier === m ? "active" : ""}`}
              onClick={() => update(nodeId, "multiplier", m)}
            >{m}×</button>
          ))}
        </div>
        <p className="settings-hint" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
          Source {sourceFps}fps → output <b>{outputFps}fps</b> ({multiplier}× frames).
        </p>
      </div>

      <div className="props-section">
        <div className="props-section-title">Source FPS</div>
        <input type="number" className="props-input" min={1} max={60} value={sourceFps}
          onChange={(e) => update(nodeId, "sourceFps", Math.max(1, Math.min(60, parseInt(e.target.value) || 24)))} />
        <p className="settings-hint" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
          Auto-detected from connected source (LTX/Wan/Hunyuan/Import). Override manually if needed.
        </p>
      </div>

      <div className="props-section">
        <div className="props-section-title">Model</div>
        <select className="props-select" value={model}
          onChange={(e) => update(nodeId, "model", e.target.value)}>
          {RIFE_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      <details className="props-section props-temp-section">
        <summary className="props-temp-header">Advanced <span className="props-temp-badge">PRO</span></summary>
        <div className="props-section">
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer" }}>
            <input type="checkbox" checked={fastMode}
              onChange={(e) => update(nodeId, "fastMode", e.target.checked)} />
            <span>Fast mode <span style={{ color: "var(--text-muted)", fontSize: 11 }}>(skip refinement)</span></span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer" }}>
            <input type="checkbox" checked={ensemble}
              onChange={(e) => update(nodeId, "ensemble", e.target.checked)} />
            <span>Ensemble <span style={{ color: "var(--text-muted)", fontSize: 11 }}>(higher quality, slower)</span></span>
          </label>
        </div>
      </details>
    </>
  );
}

export default SmoothFpsProperties;
