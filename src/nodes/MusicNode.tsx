import { memo, useCallback, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { generateMusic } from "../api/googleMediaApi";

const LYRIA_MODELS = [
  { id: "lyria-3-clip-preview", label: "Lyria 3 Clip (30s)" },
  { id: "lyria-3-pro-preview", label: "Lyria 3 Pro" },
];

function MusicNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const audioUrl = nodeData.widgetValues?._audioUrl || null;
  const selectedModel = nodeData.widgetValues?.model || LYRIA_MODELS[0].id;

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();

    let promptText = "";
    const promptEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "prompt");
    if (promptEdge) {
      const srcNode = nodesAll.find((n) => n.id === promptEdge.source);
      if (srcNode) promptText = (srcNode.data as any).widgetValues?.text || "";
    }
    if (!promptText) promptText = nodeData.widgetValues?.prompt || "";
    if (!promptText) { setError("Connect a Prompt node"); return; }

    setGenerating(true);
    setError(null);
    log("Music generation started", { nodeId: id, nodeType: "fs:music", nodeLabel: "Music Gen" });

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const model = freshWv.model || LYRIA_MODELS[0].id;

    const result = await generateMusic({ prompt: promptText, model });

    if (result.error) {
      setError(result.error);
    } else if (result.audioBase64) {
      const dataUrl = `data:audio/wav;base64,${result.audioBase64}`;
      updateWidgetValue(id, "_audioUrl", dataUrl);
    }
    setGenerating(false);
  }, [id, edgesAll, nodesAll, nodeData.widgetValues, updateWidgetValue]);

  const promptHL = connectingDir === "source" && connectingType === "TEXT" ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "AUDIO" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(promptHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  return (
    <div className={`music-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="music-node-inner">
        <div className="music-accent" />
        <div className="music-header">
          <span className="music-icon">🎵</span>
          <div className="music-header-text">
            <span className="music-title">Music Gen</span>
            <span className="music-status">{generating ? "GENERATING..." : LYRIA_MODELS.find(m => m.id === selectedModel)?.label || "Lyria 3"}</span>
          </div>
        </div>
      </div>

      <div className="videogen-inputs">
        <div className="scene-input-row">
          <Handle type="target" position={Position.Left} id="prompt"
            className={`slot-handle ${promptHL}`} style={{ color: "#f0c040" }} />
          <span className="scene-badge" style={{ color: "#f0c040", borderColor: "#f0c04066", backgroundColor: "#f0c04012" }}>TEXT</span>
          <span className="scene-input-label">Prompt</span>
        </div>
      </div>

      {/* Audio player */}
      <div className="music-player">
        {audioUrl ? (
          <audio src={audioUrl} controls style={{ width: "100%" }} />
        ) : (
          <div className="nanob-preview-empty" style={{ minHeight: 60 }}>
            <span style={{ fontSize: 32, opacity: 0.15 }}>🎵</span>
          </div>
        )}
      </div>

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button className={`localgen-generate-btn ${generating ? "generating" : ""}`} onClick={handleGenerate} disabled={generating}>
          {generating ? "Generating..." : "🎵 Generate Music"}
        </button>
      </div>

      <div className="scene-outputs">
        <div className="scene-output-row">
          <span className="scene-badge" style={{ color: "#ec4899", borderColor: "#ec489966", backgroundColor: "#ec489912" }}>AUD</span>
          <span className="scene-output-label">Audio</span>
          <Handle type="source" position={Position.Right} id="output_0"
            className={`slot-handle ${outputHL}`} style={{ color: "#ec4899" }} />
        </div>
      </div>
    </div>
  );
}

export default memo(MusicNode);
