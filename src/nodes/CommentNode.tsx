import { memo, useState, useCallback, useRef, useEffect } from "react";
import { type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";

const COMMENT_COLORS = [
  { id: "yellow",  bg: "rgba(253,216,53,0.12)",  border: "rgba(253,216,53,0.4)",  text: "#fdd835" },
  { id: "blue",    bg: "rgba(91,155,213,0.12)",  border: "rgba(91,155,213,0.4)",  text: "#5b9bd5" },
  { id: "green",   bg: "rgba(129,199,132,0.12)", border: "rgba(129,199,132,0.4)", text: "#81c784" },
  { id: "red",     bg: "rgba(232,93,117,0.12)",  border: "rgba(232,93,117,0.4)",  text: "#e85d75" },
  { id: "purple",  bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.4)", text: "#a78bfa" },
  { id: "cyan",    bg: "rgba(38,198,218,0.12)",  border: "rgba(38,198,218,0.4)",  text: "#26c6da" },
  { id: "orange",  bg: "rgba(255,152,0,0.12)",   border: "rgba(255,152,0,0.4)",   text: "#ff9800" },
  { id: "fuchsia", bg: "rgba(224,64,251,0.12)",  border: "rgba(224,64,251,0.4)",  text: "#e040fb" },
  { id: "pink",    bg: "rgba(244,143,177,0.14)", border: "rgba(244,143,177,0.45)", text: "#f48fb1" },
  { id: "slate",   bg: "rgba(144,164,174,0.12)", border: "rgba(144,164,174,0.4)", text: "#90a4ae" },
];

function CommentNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);

  const text = nodeData.widgetValues?.text || "";
  const title = nodeData.widgetValues?.title ?? "Comment";
  const colorId = nodeData.widgetValues?.color || "yellow";
  const scheme = COMMENT_COLORS.find((c) => c.id === colorId) || COMMENT_COLORS[0];

  const [editing, setEditing] = useState(!text);

  // Title inline-edit
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  useEffect(() => { setTitleDraft(title); }, [title]);
  const commitTitle = useCallback(() => {
    setEditingTitle(false);
    updateWidgetValue(id, "title", titleDraft.trim() || "Comment");
  }, [id, titleDraft, updateWidgetValue]);

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
        {editingTitle ? (
          <input
            className="nodrag"
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitTitle(); }
              if (e.key === "Escape") { setTitleDraft(title); setEditingTitle(false); }
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "transparent",
              border: "none",
              outline: `1px solid ${scheme.text}88`,
              borderRadius: 3,
              color: scheme.text,
              fontWeight: 600,
              fontSize: 13,
              padding: "1px 6px",
              width: "100%",
            }}
          />
        ) : (
          <span
            className="comment-label"
            style={{
              color: scheme.text,
              cursor: "text",
              display: "inline-block",
              padding: "0 30px",
              margin: "0 -30px",   // visually unchanged, but +30 px hit-area on each side
            }}
            onDoubleClick={(e) => { e.stopPropagation(); setEditingTitle(true); }}
            title="Double-click to rename"
          >{title || "Comment"}</span>
        )}
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
