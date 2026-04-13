import { useWorkflowStore } from "../../store/workflowStore";

// ── ComfyUI Node Properties ────────────────────────────────────────
function ComfyProperties({ data }: { data: any }) {
  return (
    <div className="props-section">
      <div className="props-info-row">
        <span className="props-info-label">Type</span>
        <span className="props-info-value">{data.type}</span>
      </div>
      <div className="props-info-row">
        <span className="props-info-label">Category</span>
        <span className="props-info-value">{data.category}</span>
      </div>
    </div>
  );
}

export default ComfyProperties;
