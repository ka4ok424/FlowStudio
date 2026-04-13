import { useWorkflowStore } from "../../store/workflowStore";

// ── Imagen Properties ─────────────────────────────────────────────
function ImagenProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const model = data.widgetValues?.model || "imagen-4.0-fast-generate-001";
  const ar = data.widgetValues?.aspectRatio || "1:1";
  const MODELS = [
    { id: "imagen-4.0-fast-generate-001", label: "Imagen 4 Fast" },
    { id: "imagen-4.0-generate-001", label: "Imagen 4" },
    { id: "imagen-4.0-ultra-generate-001", label: "Imagen 4 Ultra" },
  ];
  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Model</div>
        <select className="props-select" value={model}
          onChange={(e) => updateWidgetValue(nodeId, "model", e.target.value)}>
          {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>
      <div className="props-section">
        <div className="props-section-title">Aspect Ratio</div>
        <div className="props-aspect-row">
          {["1:1", "16:9", "9:16", "4:3", "3:4"].map((a) => (
            <button key={a} className={`props-aspect-btn ${ar === a ? "active" : ""}`}
              onClick={() => updateWidgetValue(nodeId, "aspectRatio", a)}>{a}</button>
          ))}
        </div>
      </div>
    </>
  );
}

export default ImagenProperties;
