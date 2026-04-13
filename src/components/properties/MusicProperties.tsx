import { useWorkflowStore } from "../../store/workflowStore";

// ── Music Properties ──────────────────────────────────────────────
function MusicProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const model = data.widgetValues?.model || "lyria-3-clip-preview";
  const MODELS = [
    { id: "lyria-3-clip-preview", label: "Lyria 3 Clip (30s)" },
    { id: "lyria-3-pro-preview", label: "Lyria 3 Pro" },
  ];
  return (
    <div className="props-section">
      <div className="props-section-title">Model</div>
      <select className="props-select" value={model}
        onChange={(e) => updateWidgetValue(nodeId, "model", e.target.value)}>
        {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
    </div>
  );
}

export default MusicProperties;
