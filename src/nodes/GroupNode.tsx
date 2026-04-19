import { memo, useCallback, useState } from "react";
import { type NodeProps, NodeResizer } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";

const GROUP_COLORS = [
  { id: "yellow",  color: "#fdd835", bg: "rgba(253,216,53,0.06)",  border: "rgba(253,216,53,0.3)"  },
  { id: "blue",    color: "#5b9bd5", bg: "rgba(91,155,213,0.06)",  border: "rgba(91,155,213,0.3)"  },
  { id: "green",   color: "#81c784", bg: "rgba(129,199,132,0.06)", border: "rgba(129,199,132,0.3)" },
  { id: "red",     color: "#e85d75", bg: "rgba(232,93,117,0.06)",  border: "rgba(232,93,117,0.3)"  },
  { id: "purple",  color: "#a78bfa", bg: "rgba(167,139,250,0.06)", border: "rgba(167,139,250,0.3)" },
  { id: "cyan",    color: "#26c6da", bg: "rgba(38,198,218,0.06)",  border: "rgba(38,198,218,0.3)"  },
  { id: "orange",  color: "#ff9800", bg: "rgba(255,152,0,0.06)",   border: "rgba(255,152,0,0.3)"   },
  { id: "fuchsia", color: "#e040fb", bg: "rgba(224,64,251,0.06)",  border: "rgba(224,64,251,0.3)"  },
  { id: "navy",    color: "#5c6bc0", bg: "rgba(57,73,171,0.08)",   border: "rgba(57,73,171,0.4)"   },
  { id: "slate",   color: "#90a4ae", bg: "rgba(144,164,174,0.06)", border: "rgba(144,164,174,0.3)" },
];

function GroupNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);

  const title = nodeData.widgetValues?.title ?? "Group";
  const colorId = nodeData.widgetValues?.color || "blue";
  const scheme = GROUP_COLORS.find((c) => c.id === colorId) || GROUP_COLORS.find((c) => c.id === "blue") || GROUP_COLORS[0];

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);

  const commitTitle = useCallback(() => {
    setEditing(false);
    updateWidgetValue(id, "title", editValue.trim() || "Group");
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
      {/* Title sits ABOVE the group rectangle as a floating tag. */}
      <div
        className="group-header"
        style={{
          position: "absolute",
          top: -28,
          left: 0,
          padding: "0 4px",
          borderBottom: "none",
          background: "transparent",
          pointerEvents: "auto",
        }}
      >
        {editing ? (
          <input
            className="group-title-input nodrag"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") setEditing(false); }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            style={{ color: scheme.color, borderColor: scheme.color }}
          />
        ) : (
          <span
            className="group-title"
            style={{
              color: scheme.color,
              padding: "2px 10px",
              display: "inline-block",
              textShadow: "0 1px 2px rgba(0,0,0,0.5)",
            }}
            onDoubleClick={(e) => { e.stopPropagation(); setEditValue(title); setEditing(true); }}
            title="Double-click to rename"
          >
            {title}
          </span>
        )}
      </div>
    </div>
  );
}

export default memo(GroupNode);
