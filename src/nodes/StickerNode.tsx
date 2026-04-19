import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { paletteHex } from "../utils/extendedPalette";

/**
 * Miro-style sticky note. Four bidirectional connection handles (N/E/S/W) —
 * each position has both a source and a target handle overlapped so user can
 * drag an arrow from any side to any side of another sticker (or back).
 */

// White text ONLY on the very darkest cards (palette "black" #212121).
// Everything else gets dark text per user preference.
function pickContrast(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum < 0.18 ? "#ffffff" : "#1a1a1a";
}

function StickerNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);

  const text      = (nodeData.widgetValues?.text ?? "") as string;
  const colorId   = (nodeData.widgetValues?.color ?? "cream") as string;
  const fontSize  = (nodeData.widgetValues?.fontSize ?? 12) as number;
  const bold      = !!nodeData.widgetValues?.bold;
  const italic    = !!nodeData.widgetValues?.italic;
  const underline = !!nodeData.widgetValues?.underline;
  const strike    = !!nodeData.widgetValues?.strikethrough;
  const align     = (nodeData.widgetValues?.align ?? "center") as "left" | "center";

  const bg = paletteHex(colorId, "#fff59d");
  const fg = pickContrast(bg);

  const [editing, setEditing] = useState(!text);
  // Draft holds HTML — sticker text supports per-word formatting via the
  // browser's built-in execCommand on the contentEditable element (Cmd+B,
  // Cmd+I, Cmd+U, Cmd+S work natively on the current selection).
  const [draft, setDraft] = useState(text);
  useEffect(() => { setDraft(text); }, [text]);

  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  // Detect whether the rendered text overflows the card.
  // Short text → vertical center. Long text (overflowing) → pin to top so the
  // first line stays visible.
  const fitRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  });
  // Re-check on container resize too (S/M/L preset, manual drag).
  useEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setOverflows(el.scrollHeight > el.clientHeight + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const commit = useCallback(() => {
    setEditing(false);
    updateWidgetValue(id, "text", draft);
  }, [id, draft, updateWidgetValue]);

  const textDecoration = [
    underline ? "underline" : "",
    strike ? "line-through" : "",
  ].filter(Boolean).join(" ") || "none";

  // Visible only when selected; keep handles mounted always but hide when not
  // selected so no edges break and React Flow doesn't unmount/remount them.
  const handleBase: React.CSSProperties = {
    width: 10, height: 10,
    background: "rgba(255,255,255,0.9)",
    border: `2px solid ${fg}`,
    opacity: selected ? 0.85 : 0,
    pointerEvents: selected ? "auto" : "none",
    transition: "opacity 0.12s",
  };

  const textCommonStyle: React.CSSProperties = {
    color: fg,
    fontSize,
    fontWeight: bold ? 700 : 400,
    fontStyle: italic ? "italic" : "normal",
    textDecoration,
    textAlign: align,
    lineHeight: 1.5,
  };

  return (
    <div
      className="sticker-node"
      onClick={() => setSelectedNode(id)}
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        cursor: editing ? "text" : "default",
        fontFamily: "inherit",
        // No overflow:hidden here — must allow NodeResizer corner handles to render
        // outside the rectangle.
      }}
    >
      {/* Resize handles, visible only when selected */}
      <NodeResizer
        minWidth={100}
        minHeight={50}
        lineStyle={{ borderColor: fg, opacity: 0.4 }}
        handleStyle={{ background: fg, width: 8, height: 8, opacity: 0.85, borderRadius: 2 }}
        isVisible={selected}
      />

      {/* Four bidirectional connection points — visible only when selected */}
      {(["Top", "Right", "Bottom", "Left"] as const).map((p) => (
        <div key={p}>
          <Handle type="target" position={Position[p]} id={`t-${p.toLowerCase()}`} style={handleBase} />
          <Handle type="source" position={Position[p]} id={`s-${p.toLowerCase()}`} style={handleBase} />
        </div>
      ))}

      {/* Visual card — clips its own text content; resize handles live OUTSIDE this. */}
      <div
        style={{
          width: "100%",
          height: "100%",
          background: bg,
          color: fg,
          borderRadius: 3,
          boxShadow: selected
            ? `0 0 0 2px ${fg}, 0 8px 20px rgba(0,0,0,0.35)`
            : "0 4px 12px rgba(0,0,0,0.25)",
          padding: "14px 16px",
          overflow: "hidden",
          boxSizing: "border-box",
          position: "relative",
        }}
      >
        {editing ? (
          <textarea
            ref={ref}
            className="nodrag nowheel"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setEditing(false); e.stopPropagation(); }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { commit(); e.stopPropagation(); }
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              ...textCommonStyle,
              width: "100%",
              height: "100%",
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              fontFamily: "inherit",
              padding: 0,
              boxSizing: "border-box",
            }}
          />
        ) : (
          // Outer fit-area MUST have explicit height + overflow:hidden so its
          // scrollHeight grows beyond clientHeight when text doesn't fit —
          // that's how the auto-shrink hook detects overflow in view mode.
          <div
            ref={fitRef}
            style={{
              width: "100%",
              height: "100%",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              justifyContent: overflows ? "flex-start" : "center",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                ...textCommonStyle,
                width: "100%",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                // Placeholder when empty — barely visible so it doesn't compete
                // with the sticker's color, just a hint.
                opacity: text ? 1 : 0.18,
                fontStyle: text ? textCommonStyle.fontStyle : "italic",
              }}
            >
              {text || "Double-click to edit…"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(StickerNode);
