import { memo, useCallback, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { generateImagen } from "../api/googleMediaApi";
import { addGenerationToLibrary } from "../store/mediaStore";
import MediaHistory from "./MediaHistory";
import { addToHistory } from "../utils/historyLimit";
import { log } from "../store/logStore";
import { dataUrlToBlobUrl } from "../utils/blobUrl";

const IMAGEN_MODELS = [
  { id: "imagen-4.0-fast-generate-001", label: "Imagen 4 Fast" },
  { id: "imagen-4.0-generate-001", label: "Imagen 4" },
  { id: "imagen-4.0-ultra-generate-001", label: "Imagen 4 Ultra" },
];

function ImagenNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const previewUrl = nodeData.widgetValues?._previewUrl || null;
  const selectedModel = nodeData.widgetValues?.model || IMAGEN_MODELS[0].id;

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
    log("Generate started", { nodeId: id, nodeType: "fs:imagen", nodeLabel: "Imagen" });

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const model = freshWv.model || IMAGEN_MODELS[0].id;
    const ar = freshWv.aspectRatio || "1:1";

    const result = await generateImagen({ prompt: promptText, model, aspectRatio: ar });

    if (result.error) {
      setError(result.error);
    } else if (result.images.length > 0) {
      const dataUrl = `data:image/png;base64,${result.images[0]}`;
      updateWidgetValue(id, "_previewUrl", dataUrlToBlobUrl(dataUrl));
      const prev = nodeData.widgetValues?._history || [];
      const { history: newHist, index: newIdx } = await addToHistory(id, prev, dataUrl);
      updateWidgetValue(id, "_history", newHist);
      updateWidgetValue(id, "_historyIndex", newIdx);
      log("Image ready", { nodeId: id, nodeType: "fs:imagen", nodeLabel: "Imagen", status: "success" });
      useWorkflowStore.getState().saveProject();
      addGenerationToLibrary(dataUrl, {
        prompt: promptText, model, seed: "random", nodeType: "fs:imagen",
      });
    }
    setGenerating(false);
  }, [id, edgesAll, nodesAll, nodeData.widgetValues, updateWidgetValue]);

  const promptHL = connectingDir === "source" && connectingType === "TEXT" ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(promptHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  return (
    <div className={`imagen-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="imagen-node-inner">
        <div className="imagen-accent" />
        <div className="imagen-header">
          <span className="imagen-icon">🖼</span>
          <div className="imagen-header-text">
            <span className="imagen-title">Imagen</span>
            <span className="imagen-status">{generating ? "GENERATING..." : IMAGEN_MODELS.find(m => m.id === selectedModel)?.label || "Imagen 4"}</span>
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

      <MediaHistory nodeId={id} history={nodeData.widgetValues?._history || []} historyIndex={nodeData.widgetValues?._historyIndex ?? -1} fallbackUrl={previewUrl} emptyIcon="🖼" />

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button className={`localgen-generate-btn ${generating ? "generating" : ""}data-fs-run-id={id} `} onClick={handleGenerate} disabled={generating}>
          {generating ? "Generating..." : "🖼 Generate"}
        </button>
      </div>

      <div className="scene-outputs">
        <div className="scene-output-row">
          <span className="scene-badge" style={{ color: "#64b5f6", borderColor: "#64b5f666", backgroundColor: "#64b5f612" }}>IMG</span>
          <span className="scene-output-label">Image</span>
          <Handle type="source" position={Position.Right} id="output_0"
            className={`slot-handle ${outputHL}`} style={{ color: "#64b5f6" }} />
        </div>
      </div>
    </div>
  );
}

export default memo(ImagenNode);
