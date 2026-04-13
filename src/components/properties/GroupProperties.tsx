import { useWorkflowStore } from "../../store/workflowStore";

// ── Group Properties ──────────────────────────────────────────────
function GroupProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const title = data.widgetValues?.title ?? "";
  const color = data.widgetValues?.color || "blue";
  const COLORS = ["red", "blue", "green", "purple", "orange", "cyan"];
  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Title</div>
        <input type="text" className="props-input" value={title}
          onChange={(e) => updateWidgetValue(nodeId, "title", e.target.value)}
          onBlur={(e) => { if (!e.target.value.trim()) updateWidgetValue(nodeId, "title", "Group"); }}
          placeholder="Group" />
      </div>
      <div className="props-section">
        <div className="props-section-title">Color</div>
        <div className="props-aspect-row">
          {COLORS.map((c) => (
            <button key={c} className={`props-color-btn ${color === c ? "active" : ""}`}
              style={{ background: c === "red" ? "#e85d75" : c === "blue" ? "#5b9bd5" : c === "green" ? "#81c784" : c === "purple" ? "#a78bfa" : c === "orange" ? "#ff9800" : "#26c6da" }}
              onClick={() => updateWidgetValue(nodeId, "color", c)} />
          ))}
        </div>
      </div>
    </>
  );
}

export default GroupProperties;
