import { useWorkflowStore } from "../../store/workflowStore";

// ── TikTok Publish Properties ─────────────────────────────────────
function TikTokProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const title = data.widgetValues?.title ?? "";
  const privacy = data.widgetValues?.privacy || "SELF_ONLY";
  const aiGenerated = data.widgetValues?.aiGenerated !== false;
  const disableComment = data.widgetValues?.disableComment || false;
  const disableDuet = data.widgetValues?.disableDuet || false;
  const disableStitch = data.widgetValues?.disableStitch || false;

  const PRIVACY = [
    { id: "PUBLIC_TO_EVERYONE", label: "Public" },
    { id: "FOLLOWER_OF_CREATOR", label: "Followers" },
    { id: "MUTUAL_FOLLOW_FRIENDS", label: "Friends" },
    { id: "SELF_ONLY", label: "Private" },
  ];

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Caption</div>
        <textarea className="props-textarea" value={title} rows={3}
          onChange={(e) => updateWidgetValue(nodeId, "title", e.target.value)}
          placeholder="Video description, hashtags..." />
      </div>

      <div className="props-section">
        <div className="props-section-title">Privacy</div>
        <select className="props-select" value={privacy}
          onChange={(e) => updateWidgetValue(nodeId, "privacy", e.target.value)}>
          {PRIVACY.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>

      <div className="props-section">
        <div className="props-section-title">Settings</div>
        <label className="props-checkbox-row">
          <input type="checkbox" checked={aiGenerated}
            onChange={(e) => updateWidgetValue(nodeId, "aiGenerated", e.target.checked)} />
          <span>AI Generated Content</span>
        </label>
        <label className="props-checkbox-row">
          <input type="checkbox" checked={disableComment}
            onChange={(e) => updateWidgetValue(nodeId, "disableComment", e.target.checked)} />
          <span>Disable Comments</span>
        </label>
        <label className="props-checkbox-row">
          <input type="checkbox" checked={disableDuet}
            onChange={(e) => updateWidgetValue(nodeId, "disableDuet", e.target.checked)} />
          <span>Disable Duet</span>
        </label>
        <label className="props-checkbox-row">
          <input type="checkbox" checked={disableStitch}
            onChange={(e) => updateWidgetValue(nodeId, "disableStitch", e.target.checked)} />
          <span>Disable Stitch</span>
        </label>
      </div>

      {/* Publish History */}
      {data.widgetValues?._publishHistory?.length > 0 && (
        <div className="props-section">
          <div className="props-section-title">Publish History</div>
          <div className="tiktok-history-list">
            {[...data.widgetValues._publishHistory].reverse().map((entry: any, i: number) => (
              <div key={i} className={`tiktok-history-item ${entry.status}`}>
                <div className="tiktok-history-row1">
                  <span>{entry.status === "success" ? "\u2705" : "\u274C"}</span>
                  <span className="tiktok-history-msg">
                    {entry.caption ? `"${entry.caption}${entry.caption.length >= 50 ? "..." : ""}"` : entry.message}
                  </span>
                  <span className="tiktok-history-time">
                    {new Date(entry.time).toLocaleDateString([], { day: "numeric", month: "short" })},{" "}
                    {new Date(entry.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                {entry.caption && (
                  <div className="tiktok-history-row2">
                    {entry.privacy === "SELF_ONLY" ? "Private" : entry.privacy === "PUBLIC_TO_EVERYONE" ? "Public" : entry.privacy?.split("_").pop()} · {entry.sourceNode?.replace("fs:", "")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default TikTokProperties;
