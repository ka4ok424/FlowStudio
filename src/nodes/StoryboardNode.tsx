import { memo, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";

const MAX_SCENES = 20;

function StoryboardNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const title = nodeData.widgetValues?.title || "Storyboard";
  const sceneCount = nodeData.widgetValues?._sceneCount || 4;

  // Read connected scenes
  const scenes: { title: string; previewUrl: string | null; index: number }[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const edge = edgesAll.find((e) => e.target === id && e.targetHandle === `scene_${i}`);
    if (edge) {
      const srcNode = nodesAll.find((n) => n.id === edge.source);
      if (srcNode) {
        const sd = srcNode.data as any;
        scenes.push({
          title: sd.widgetValues?.sceneTitle || `Scene ${i + 1}`,
          previewUrl: sd.widgetValues?._previewUrl || null,
          index: i,
        });
        continue;
      }
    }
    scenes.push({ title: `Scene ${i + 1}`, previewUrl: null, index: i });
  }

  const addScene = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (sceneCount < MAX_SCENES) {
      updateWidgetValue(id, "_sceneCount", sceneCount + 1);
    }
  }, [id, sceneCount, updateWidgetValue]);

  const removeScene = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (sceneCount > 1) {
      updateWidgetValue(id, "_sceneCount", sceneCount - 1);
    }
  }, [id, sceneCount, updateWidgetValue]);

  // Highlights
  const sceneHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!sceneHL : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  const filledCount = scenes.filter((s) => s.previewUrl).length;

  return (
    <div
      className={`storyboard-node ${selected ? "selected" : ""} ${dimClass}`}
      onClick={() => setSelectedNode(id)}
    >
      <div className="storyboard-node-inner">
        <div className="storyboard-accent" />
        <div className="storyboard-header">
          <span className="storyboard-icon">📋</span>
          <div className="storyboard-header-text">
            <span className="storyboard-title">{title}</span>
            <span className="storyboard-status">{filledCount}/{sceneCount} scenes</span>
          </div>
        </div>
      </div>

      {/* Scene inputs — handles along left edge */}
      <div className="storyboard-inputs">
        {scenes.map((scene, i) => (
          <div key={`input_${i}`} className="storyboard-input-row">
            <Handle type="target" position={Position.Left} id={`scene_${i}`}
              className={`slot-handle ${sceneHL}`} style={{ color: "#64b5f6" }} />
            <span className="scene-badge" style={{ color: "#64b5f6", borderColor: "#64b5f666", backgroundColor: "#64b5f612" }}>IMG</span>
            <span className="scene-input-label">Scene {i + 1}</span>
          </div>
        ))}
      </div>

      {/* Scene grid — visual only */}
      <div className="storyboard-grid">
        {scenes.map((scene, i) => (
          <div key={i} className="storyboard-cell">
            <div className="storyboard-cell-num">{i + 1}</div>
            {scene.previewUrl ? (
              <img src={scene.previewUrl} alt={scene.title} className="storyboard-cell-img" />
            ) : (
              <div className="storyboard-cell-empty">
                <span>🎬</span>
              </div>
            )}
            <div className="storyboard-cell-title">{scene.title}</div>
          </div>
        ))}
      </div>

      {/* Add/remove scene */}
      <div className="storyboard-controls">
        {sceneCount < MAX_SCENES && (
          <button className="scene-char-btn" onClick={addScene} title="Add scene">+</button>
        )}
        {sceneCount > 1 && (
          <button className="scene-char-btn scene-char-remove" onClick={removeScene} title="Remove scene">−</button>
        )}
        <span className="scene-char-count">{sceneCount}/{MAX_SCENES}</span>
      </div>
    </div>
  );
}

export default memo(StoryboardNode);
