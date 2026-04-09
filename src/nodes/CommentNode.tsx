import { memo, useState, useCallback, useRef, useEffect } from "react";
import { type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";

const COMMENT_COLORS = [
  { id: "yellow", bg: "rgba(240,192,64,0.12)", border: "rgba(240,192,64,0.4)", text: "#f0c040" },
  { id: "blue", bg: "rgba(91,155,213,0.12)", border: "rgba(91,155,213,0.4)", text: "#5b9bd5" },
  { id: "green", bg: "rgba(129,199,132,0.12)", border: "rgba(129,199,132,0.4)", text: "#81c784" },
  { id: "red", bg: "rgba(232,93,117,0.12)", border: "rgba(232,93,117,0.4)", text: "#e85d75" },
  { id: "purple", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.4)", text: "#a78bfa" },
];

function CommentNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);

  const text = nodeData.widgetValues?.text || "";
  const colorId = nodeData.widgetValues?.color || "yellow";
  const scheme = COMMENT_COLORS.find((c) => c.id === colorId) || COMMENT_COLORS[0];

  const [editing, setEditing] = useState(!text);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateWidgetValue(id, "text", e.target.value);
  }, [id, updateWidgetValue]);

  return (
    <div
      className={`comment-node ${selected ? "selected" : ""}`}
      style={{ background: scheme.bg, borderColor: selected ? scheme.text : scheme.border }}
      onClick={() => setSelectedNode(id)}
    >
      <div className="comment-header">
        <span className="comment-icon">📝</span>
        <span className="comment-label" style={{ color: scheme.text }}>Comment</span>
      </div>
      {editing ? (
        <AutoTextarea
          value={text}
          onChange={handleChange}
          onBlur={() => setEditing(false)}
        />
      ) : (
        <div
          className="comment-text"
          onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
        >
          {text || "Double-click to edit..."}
        </div>
      )}
    </div>
  );
}

function AutoTextarea({ value, onChange, onBlur }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
      ref.current.focus();
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="comment-textarea nodrag nowheel"
      value={value}
      onChange={(e) => { onChange(e); if (ref.current) { ref.current.style.height = "auto"; ref.current.style.height = ref.current.scrollHeight + "px"; } }}
      onBlur={onBlur}
      placeholder="Write a note..."
    />
  );
}

export default memo(CommentNode);
