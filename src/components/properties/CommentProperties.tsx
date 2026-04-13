import { useWorkflowStore } from "../../store/workflowStore";

// ── Comment Properties ───────────────────────────────────────────
function CommentProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const text = data.widgetValues?.text || "";
  const color = data.widgetValues?.color || "yellow";
  const COLORS = ["yellow", "blue", "green", "red", "purple"];
  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Comment</div>
        <textarea className="props-textarea" value={text} rows={5}
          onChange={(e) => updateWidgetValue(nodeId, "text", e.target.value)}
          placeholder="Write a note..." />
      </div>
      <div className="props-section">
        <div className="props-section-title">Color</div>
        <div className="props-aspect-row">
          {COLORS.map((c) => (
            <button key={c} className={`props-color-btn ${color === c ? "active" : ""}`}
              style={{ background: c === "yellow" ? "#f0c040" : c === "blue" ? "#5b9bd5" : c === "green" ? "#81c784" : c === "red" ? "#e85d75" : "#a78bfa" }}
              onClick={() => updateWidgetValue(nodeId, "color", c)} />
          ))}
        </div>
      </div>
    </>
  );
}

export default CommentProperties;
