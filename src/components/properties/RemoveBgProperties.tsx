import { useWorkflowStore } from "../../store/workflowStore";

// ── Remove BG Properties ─────────────────────────────────────────
function RemoveBgProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const model = data.widgetValues?.model ?? "BiRefNet-general";

  const models = [
    { value: "BiRefNet-general", label: "General (balanced)", desc: "Best overall quality, 1024px" },
    { value: "BiRefNet-portrait", label: "Portrait", desc: "People, hair, skin — cleanest edges" },
    { value: "BiRefNet-HR", label: "High-Res", desc: "Up to 2560px, maximum detail" },
    { value: "BiRefNet_toonout", label: "Cartoon / 3D", desc: "For stylized, CG, Pixar-style" },
    { value: "BiRefNet-matting", label: "Matting", desc: "Semi-transparent edges, glass, fur" },
    { value: "BiRefNet-HR-matting", label: "HR Matting", desc: "High-res + transparent edges" },
    { value: "BiRefNet_dynamic", label: "Dynamic", desc: "Any resolution, most robust" },
    { value: "BiRefNet_lite", label: "Lite (fast)", desc: "Quick preview, lower quality" },
  ];

  const current = models.find(m => m.value === model);

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Model</div>
        <select className="props-select" value={model}
          onChange={(e) => updateWidgetValue(nodeId, "model", e.target.value)}>
          {models.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        {current && <p className="settings-hint" style={{ marginTop: 4 }}>{current.desc}</p>}
      </div>
    </>
  );
}

export default RemoveBgProperties;
