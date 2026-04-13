import { useWorkflowStore } from "../../store/workflowStore";

// ── Prompt Properties ──────────────────────────────────────────────
function PromptProperties({ data }: { data: any }) {
  const text = data.widgetValues?.text || "";
  return (
    <div className="props-section">
      <div className="props-info-row">
        <span className="props-info-label">Characters</span>
        <span className="props-info-value">{text.length.toLocaleString()}</span>
      </div>
      <div className="props-info-row">
        <span className="props-info-label">Words</span>
        <span className="props-info-value">{text ? text.trim().split(/\s+/).length : 0}</span>
      </div>
    </div>
  );
}

export default PromptProperties;
