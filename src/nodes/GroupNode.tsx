import { memo, useCallback, useState } from "react";
import { type NodeProps, NodeResizer } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";

const GROUP_COLORS = [
  { id: "red", color: "#e85d75", bg: "rgba(232,93,117,0.06)", border: "rgba(232,93,117,0.3)" },
  { id: "blue", color: "#5b9bd5", bg: "rgba(91,155,213,0.06)", border: "rgba(91,155,213,0.3)" },
  { id: "green", color: "#81c784", bg: "rgba(129,199,132,0.06)", border: "rgba(129,199,132,0.3)" },
  { id: "purple", color: "#a78bfa", bg: "rgba(167,139,250,0.06)", border: "rgba(167,139,250,0.3)" },
  { id: "orange", color: "#ff9800", bg: "rgba(255,152,0,0.06)", border: "rgba(255,152,0,0.3)" },
  { id: "cyan", color: "#26c6da", bg: "rgba(38,198,218,0.06)", border: "rgba(38,198,218,0.3)" },
];

function GroupNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);

  const title = nodeData.widgetValues?.title || "Group";
  const colorId = nodeData.widgetValues?.color || "blue";
  const scheme = GROUP_COLORS.find((c) => c.id === colorId) || GROUP_COLORS[1];

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);

  const commitTitle = useCallback(() => {
    setEditing(false);
    if (editValue.trim()) {
      updateWidgetValue(id, "title", editValue.trim());
    }
  }, [id, editValue, updateWidgetValue]);

  return (
    <div
      className="group-node"
      style={{
        background: scheme.bg,
        borderColor: selected ? scheme.color : scheme.border,
        width: "100%",
        height: "100%",
      }}
      onClick={() => setSelectedNode(id)}
    >
      <NodeResizer
        minWidth={300}
        minHeight={200}
        lineStyle={{ borderColor: scheme.border }}
        handleStyle={{ background: scheme.color, width: 8, height: 8 }}
        isVisible={selected}
      />
      <div className="group-header" style={{ borderBottomColor: scheme.border }}>
        <div className="group-accent" style={{ background: scheme.color }} />
        {editing ? (
          <input
            className="group-title-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") setEditing(false); }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="group-title"
            style={{ color: scheme.color }}
            onDoubleClick={(e) => { e.stopPropagation(); setEditValue(title); setEditing(true); }}
          >
            {title}
          </span>
        )}
      </div>
    </div>
  );
}

export default memo(GroupNode);
