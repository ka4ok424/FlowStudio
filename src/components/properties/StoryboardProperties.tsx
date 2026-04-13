import { useWorkflowStore } from "../../store/workflowStore";

// ── Storyboard Properties ─────────────────────────────────────────
function StoryboardProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const title = data.widgetValues?.title ?? "";

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Title</div>
        <input type="text" className="props-input" value={title}
          onChange={(e) => updateWidgetValue(nodeId, "title", e.target.value)}
          onBlur={(e) => { if (!e.target.value.trim()) updateWidgetValue(nodeId, "title", "Storyboard"); }}
          placeholder="Storyboard title..." />
      </div>
    </>
  );
}

export default StoryboardProperties;
