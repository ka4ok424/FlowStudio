import { useWorkflowStore } from "../../store/workflowStore";

// ── Character Card Properties ─────────────────────────────────────
function CharacterCardProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const name = data.widgetValues?.name || "";
  const description = data.widgetValues?.description || "";
  const status = data.widgetValues?.status || "draft";
  const portraitUrl = data.widgetValues?.portraitUrl || null;

  const statusColors: Record<string, string> = {
    draft: "#888", approved: "#4caf50", rejected: "#ef5350",
  };

  return (
    <>
      {/* Portrait preview */}
      {portraitUrl && (
        <div className="props-preview">
          <img src={portraitUrl} alt={name} />
        </div>
      )}

      {/* Status badge */}
      <div className="props-section">
        <div className="props-info-row">
          <span className="props-info-label">Status</span>
          <span className="props-info-value" style={{ color: statusColors[status] }}>
            {status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Name */}
      <div className="props-section">
        <div className="props-section-title">Name</div>
        <input
          type="text"
          className="props-input"
          value={name}
          onChange={(e) => updateWidgetValue(nodeId, "name", e.target.value)}
          placeholder="Character name"
        />
      </div>

      {/* Description */}
      <div className="props-section">
        <div className="props-section-title">Description</div>
        <textarea
          className="props-textarea"
          value={description}
          onChange={(e) => updateWidgetValue(nodeId, "description", e.target.value)}
          placeholder="Appearance, personality, traits, backstory..."
          rows={6}
        />
      </div>

      {/* Actions */}
      <div className="props-section">
        <div className="props-file-bar">
          <div className="props-file-bar-btns" style={{ width: "100%", justifyContent: "center" }}>
            {status === "draft" && (
              <>
                <button className="props-file-btn" style={{ color: "#4caf50" }}
                  onClick={() => updateWidgetValue(nodeId, "status", "approved")} title="Approve">Approve</button>
                <button className="props-file-btn" style={{ color: "#ef5350" }}
                  onClick={() => updateWidgetValue(nodeId, "status", "rejected")} title="Reject">Reject</button>
              </>
            )}
            {status !== "draft" && (
              <button className="props-file-btn"
                onClick={() => updateWidgetValue(nodeId, "status", "draft")} title="Reset">Reset to Draft</button>
            )}
          </div>
        </div>
      </div>

      {/* Clear portrait */}
      {portraitUrl && (
        <div className="props-section">
          <button className="props-file-btn props-file-delete"
            onClick={() => updateWidgetValue(nodeId, "portraitUrl", null)}>Remove Portrait</button>
        </div>
      )}
    </>
  );
}

export default CharacterCardProperties;
