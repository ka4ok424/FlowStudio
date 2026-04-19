import { useWorkflowStore } from "../../store/workflowStore";
import { GEMINI_TEXT_MODELS } from "../../utils/llmCallbacks";

// Shared inspector for fs:critique and fs:refine.
function LlmTextProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const update = useWorkflowStore((s) => s.updateWidgetValue);
  const wv = data.widgetValues || {};
  const v = <T,>(k: string, d: T): T => (wv[k] !== undefined ? wv[k] : d);

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Model</div>
        <select className="props-select"
          value={v("model", "gemini-2.5-flash")}
          onChange={(e) => update(nodeId, "model", e.target.value)}>
          {GEMINI_TEXT_MODELS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <details className="props-section props-temp-section">
        <summary className="props-temp-header">Advanced <span className="props-temp-badge">PRO</span></summary>
        <div className="props-section">
          <div className="props-section-title">Temperature</div>
          <input type="range" className="props-range" min={0} max={1.5} step={0.05}
            value={v("temperature", 0.5)}
            onChange={(e) => update(nodeId, "temperature", parseFloat(e.target.value))} />
          <span className="props-range-value">{(v("temperature", 0.5) as number).toFixed(2)}</span>
        </div>
        <div className="props-section">
          <div className="props-section-title">Max Output Tokens</div>
          <input type="range" className="props-range" min={256} max={8192} step={64}
            value={v("maxOutputTokens", 4096)}
            onChange={(e) => update(nodeId, "maxOutputTokens", parseInt(e.target.value))} />
          <span className="props-range-value">{v("maxOutputTokens", 4096)}</span>
          <p className="settings-hint" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            Gemini 2.5 spends most of this budget on internal reasoning before producing the visible answer. Bump to 4-8k for full responses; 2.5-pro caps at 65k but Flash maxes at 8192.
          </p>
        </div>
      </details>
    </>
  );
}

export default LlmTextProperties;
