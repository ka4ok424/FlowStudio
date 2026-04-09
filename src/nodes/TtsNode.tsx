import { memo, useCallback, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { generateTts } from "../api/googleMediaApi";

const TTS_MODELS = [
  { id: "gemini-2.5-flash-preview-tts", label: "TTS Flash" },
  { id: "gemini-2.5-pro-preview-tts", label: "TTS Pro" },
];

const VOICES = ["Kore", "Charon", "Fenrir", "Aoede", "Puck", "Leda", "Orus", "Zephyr"];

function TtsNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const audioUrl = nodeData.widgetValues?._audioUrl || null;
  const selectedModel = nodeData.widgetValues?.model || TTS_MODELS[0].id;
  const selectedVoice = nodeData.widgetValues?.voice || "Kore";

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();

    let text = "";
    const textEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "text");
    if (textEdge) {
      const srcNode = nodesAll.find((n) => n.id === textEdge.source);
      if (srcNode) text = (srcNode.data as any).widgetValues?.text || "";
    }
    if (!text) text = nodeData.widgetValues?.text || "";
    if (!text) { setError("Connect a Prompt node with text"); return; }

    setGenerating(true);
    setError(null);

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const model = freshWv.model || TTS_MODELS[0].id;
    const voice = freshWv.voice || "Kore";

    const result = await generateTts({ text, model, voiceName: voice });

    if (result.error) {
      setError(result.error);
    } else if (result.audioBase64) {
      const dataUrl = `data:audio/wav;base64,${result.audioBase64}`;
      updateWidgetValue(id, "_audioUrl", dataUrl);
    }
    setGenerating(false);
  }, [id, edgesAll, nodesAll, nodeData.widgetValues, updateWidgetValue]);

  const textHL = connectingDir === "source" && connectingType === "TEXT" ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "AUDIO" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(textHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  return (
    <div className={`tts-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="tts-node-inner">
        <div className="tts-accent" />
        <div className="tts-header">
          <span className="tts-icon">🗣</span>
          <div className="tts-header-text">
            <span className="tts-title">Text to Speech</span>
            <span className="tts-status">{generating ? "GENERATING..." : selectedVoice}</span>
          </div>
        </div>
      </div>

      <div className="videogen-inputs">
        <div className="scene-input-row">
          <Handle type="target" position={Position.Left} id="text"
            className={`slot-handle ${textHL}`} style={{ color: "#f0c040" }} />
          <span className="scene-badge" style={{ color: "#f0c040", borderColor: "#f0c04066", backgroundColor: "#f0c04012" }}>TEXT</span>
          <span className="scene-input-label">Text</span>
        </div>
      </div>

      {/* Audio player */}
      <div className="music-player">
        {audioUrl ? (
          <audio src={audioUrl} controls style={{ width: "100%" }} />
        ) : (
          <div className="nanob-preview-empty" style={{ minHeight: 60 }}>
            <span style={{ fontSize: 32, opacity: 0.15 }}>🗣</span>
          </div>
        )}
      </div>

      {error && <div className="nanob-error">{error}</div>}

      <div className="nanob-actions">
        <button className={`localgen-generate-btn ${generating ? "generating" : ""}`} onClick={handleGenerate} disabled={generating}>
          {generating ? "Generating..." : "🗣 Generate Speech"}
        </button>
      </div>

      <div className="scene-outputs">
        <div className="scene-output-row">
          <span className="scene-badge" style={{ color: "#e8a040", borderColor: "#e8a04066", backgroundColor: "#e8a04012" }}>AUD</span>
          <span className="scene-output-label">Audio</span>
          <Handle type="source" position={Position.Right} id="output_0"
            className={`slot-handle ${outputHL}`} style={{ color: "#e8a040" }} />
        </div>
      </div>
    </div>
  );
}

export default memo(TtsNode);
