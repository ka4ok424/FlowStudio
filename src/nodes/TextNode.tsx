import { memo, useCallback, useEffect, useRef, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { paletteHex } from "../utils/extendedPalette";

/**
 * Pure-informational text/label on the canvas.
 * No inputs/outputs — purely decorative, like a sticky caption.
 * Double-click to edit inline; widget values expose font size, style, colour.
 */
function TextNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);

  const text      = (nodeData.widgetValues?.text ?? "") as string;
  const fontSize  = (nodeData.widgetValues?.fontSize ?? 16) as number;
  const bold      = !!nodeData.widgetValues?.bold;
  const italic    = !!nodeData.widgetValues?.italic;
  const underline = !!nodeData.widgetValues?.underline;
  const strike    = !!nodeData.widgetValues?.strikethrough;
  const align     = (nodeData.widgetValues?.align ?? "left") as "left" | "center" | "right";
  const colorId   = (nodeData.widgetValues?.color ?? "white") as string;
  const color     = paletteHex(colorId, "#ffffff");

  const [editing, setEditing] = useState(!text);
  const [draft, setDraft] = useState(text);
  useEffect(() => { setDraft(text); }, [text]);

  const ref = useRef<HTMLTextAreaElement>(null);

  // Focus + select ONCE when entering edit mode.
  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  // Auto-resize on every change (must not re-select — that killed typing).
  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [editing, draft]);

  const commit = useCallback(() => {
    setEditing(false);
    updateWidgetValue(id, "text", draft);
  }, [id, draft, updateWidgetValue]);

  const textDecoration = [
    underline ? "underline" : "",
    strike ? "line-through" : "",
  ].filter(Boolean).join(" ") || "none";

  const commonStyle: React.CSSProperties = {
    color,
    fontSize: Math.max(8, Math.min(128, fontSize)),
    fontWeight: bold ? 700 : 400,
    fontStyle: italic ? "italic" : "normal",
    textDecoration,
    textAlign: align,
    lineHeight: 1.25,
    minWidth: 80,
    minHeight: 20,
    padding: "2px 6px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  return (
    <div
      className="text-node"
      onClick={() => setSelectedNode(id)}
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
      style={{
        background: "transparent",
        border: selected ? "1px dashed rgba(255,255,255,0.35)" : "1px dashed transparent",
        borderRadius: 6,
        padding: 2,
        cursor: editing ? "text" : "default",
      }}
    >
      {editing ? (
        <textarea
          ref={ref}
          className="nodrag nowheel"
          value={draft}
          placeholder="Type your note…"
          onChange={(e) => {
            setDraft(e.target.value);
            const el = ref.current;
            if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setDraft(text); setEditing(false); e.stopPropagation(); }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { commit(); e.stopPropagation(); }
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            ...commonStyle,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 4,
            resize: "none",
            outline: "none",
            fontFamily: "inherit",
            width: "100%",
            boxSizing: "border-box",
          }}
        />
      ) : (
        <div style={commonStyle}>{text || <span style={{ opacity: 0.35 }}>Double-click to edit…</span>}</div>
      )}
    </div>
  );
}

export default memo(TextNode);
