import { useWorkflowStore } from "../../store/workflowStore";

// ── Video Gen Properties ──────────────────────────────────────────
function VideoGenProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const model = data.widgetValues?.model || "veo-2.0-generate-001";
  const ar = data.widgetValues?.aspectRatio || "16:9";
  const VEO = [
    { id: "veo-2.0-generate-001", label: "Veo 2" },
    { id: "veo-3.0-fast-generate-001", label: "Veo 3 Fast" },
    { id: "veo-3.0-generate-001", label: "Veo 3" },
    { id: "veo-3.1-fast-generate-preview", label: "Veo 3.1 Fast" },
    { id: "veo-3.1-lite-generate-preview", label: "Veo 3.1 Lite" },
    { id: "veo-3.1-generate-preview", label: "Veo 3.1" },
  ];
  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Model</div>
        <select className="props-select" value={model}
          onChange={(e) => updateWidgetValue(nodeId, "model", e.target.value)}>
          {VEO.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>
      <div className="props-section">
        <div className="props-section-title">Aspect Ratio</div>
        <div className="props-aspect-row">
          {["16:9", "9:16", "1:1"].map((a) => (
            <button key={a} className={`props-aspect-btn ${ar === a ? "active" : ""}`}
              onClick={() => updateWidgetValue(nodeId, "aspectRatio", a)}>{a}</button>
          ))}
        </div>
      </div>
    </>
  );
}

export default VideoGenProperties;
