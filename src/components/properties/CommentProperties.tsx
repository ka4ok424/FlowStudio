import { useWorkflowStore } from "../../store/workflowStore";

// Shared palette — keep identical with GroupProperties.
const COLOR_MAP: Record<string, string> = {
  yellow:  "#fdd835",
  blue:    "#5b9bd5",
  green:   "#81c784",
  red:     "#e85d75",
  purple:  "#a78bfa",
  cyan:    "#26c6da",
  orange:  "#ff9800",
  fuchsia: "#e040fb",
  navy:    "#3949ab",
  slate:   "#90a4ae",
};
const COLORS = Object.keys(COLOR_MAP);

// ── Comment Properties ───────────────────────────────────────────
function CommentProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const title = data.widgetValues?.title ?? "Comment";
  const text = data.widgetValues?.text || "";
  const color = data.widgetValues?.color || "yellow";
  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Title</div>
        <input type="text" className="props-input" value={title}
          onChange={(e) => updateWidgetValue(nodeId, "title", e.target.value)}
          onBlur={(e) => { if (!e.target.value.trim()) updateWidgetValue(nodeId, "title", "Comment"); }}
          placeholder="Comment" />
      </div>
      <div className="props-section">
        <div className="props-section-title">Text</div>
        <textarea className="props-textarea" value={text} rows={5}
          onChange={(e) => updateWidgetValue(nodeId, "text", e.target.value)}
          placeholder="Write a note..." />
      </div>
      <div className="props-section">
        <div className="props-section-title">Color</div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(10, 1fr)",
          gap: 4,
        }}>
          {COLORS.map((c) => (
            <button key={c} className={`props-color-btn ${color === c ? "active" : ""}`}
              title={c}
              style={{ width: "100%", aspectRatio: "1 / 1", background: COLOR_MAP[c] }}
              onClick={() => updateWidgetValue(nodeId, "color", c)} />
          ))}
        </div>
      </div>
    </>
  );
}

export default CommentProperties;
