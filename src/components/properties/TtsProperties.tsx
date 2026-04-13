import { useWorkflowStore } from "../../store/workflowStore";

// ── TTS Properties ────────────────────────────────────────────────
function TtsProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const model = data.widgetValues?.model || "gemini-2.5-flash-preview-tts";
  const voice = data.widgetValues?.voice || "Kore";
  const MODELS = [
    { id: "gemini-2.5-flash-preview-tts", label: "TTS Flash" },
    { id: "gemini-2.5-pro-preview-tts", label: "TTS Pro" },
  ];
  const VOICES = ["Kore", "Charon", "Fenrir", "Aoede", "Puck", "Leda", "Orus", "Zephyr"];
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
        <div className="props-section-title">Voice</div>
        <select className="props-select" value={voice}
          onChange={(e) => updateWidgetValue(nodeId, "voice", e.target.value)}>
          {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
    </>
  );
}

export default TtsProperties;
