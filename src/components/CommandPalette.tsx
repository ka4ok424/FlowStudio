import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useWorkflowStore } from "../store/workflowStore";
import { getAllNativeNodes } from "../nodes/registry";

interface Item {
  type: string;
  label: string;
  kind: "native" | "comfy";
  icon?: string;
  sub?: string;          // category or description
  score?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  addAt: { x: number; y: number };
}

/**
 * Command palette (Tab). Fuzzy search across native + ComfyUI nodes, arrow nav,
 * Enter to spawn at the provided `addAt` position (cursor position if available,
 * otherwise viewport center — decided by the caller).
 */
export default function CommandPalette({ open, onClose, addAt }: Props) {
  const { nodeDefs, addNode, pushUndo } = useWorkflowStore();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const native = getAllNativeNodes().map<Item>((n) => ({
      type: n.type,
      label: n.label,
      icon: n.icon,
      kind: "native",
      sub: n.description?.slice(0, 80),
    }));
    const comfy = Object.entries(nodeDefs).map<Item>(([name, def]) => ({
      type: name,
      label: def.display_name || name,
      kind: "comfy",
      sub: def.category || "",
    }));
    return [...native, ...comfy];
  }, [nodeDefs]);

  const filtered = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return items.filter((i) => i.kind === "native").slice(0, 80);
    }
    // subsequence fuzzy match + starts-with bonus
    const scored: Item[] = [];
    for (const it of items) {
      const name = it.label.toLowerCase();
      const type = it.type.toLowerCase();
      let score = 0;
      if (name.startsWith(q)) score += 100;
      else if (name.includes(q)) score += 50;
      else if (type.includes(q)) score += 30;
      else {
        // subsequence check on label
        let qi = 0;
        for (let i = 0; i < name.length && qi < q.length; i++) {
          if (name[i] === q[qi]) qi++;
        }
        if (qi === q.length) score = 10;
      }
      if (it.kind === "native") score += 15;
      if (score > 0) scored.push({ ...it, score });
    }
    scored.sort((a, b) => (b.score! - a.score!));
    return scored.slice(0, 60);
  }, [items, query]);

  useEffect(() => { setIndex(0); }, [query]);

  // Keep selected item in view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.children[index] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const spawn = useCallback((it: Item) => {
    pushUndo();
    addNode(it.type, addAt);
    onClose();
  }, [addNode, addAt, pushUndo, onClose]);

  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[index];
      if (pick) spawn(pick);
    } else if (e.key === "Tab") {
      e.preventDefault();
      onClose();
    }
  }, [filtered, index, onClose, spawn]);

  if (!open) return null;

  return createPortal(
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 10000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "14vh",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 560, maxWidth: "90vw",
          background: "#1b1b22",
          border: "1px solid #3b82f6",
          borderRadius: 10,
          boxShadow: "0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.2)",
          overflow: "hidden",
          display: "flex", flexDirection: "column",
        }}
      >
        <input
          ref={inputRef}
          className="nodrag nowheel"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          placeholder="Search nodes…  (↑↓ to select, Enter to insert, Esc/Tab to close)"
          style={{
            padding: "14px 16px",
            background: "transparent",
            border: "none",
            borderBottom: "1px solid #2a2a35",
            color: "#fff",
            fontSize: 15,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        <div
          ref={listRef}
          style={{
            maxHeight: "52vh",
            overflowY: "auto",
            padding: "4px 0",
          }}
        >
          {filtered.length === 0 && (
            <div style={{ padding: 20, color: "#888", fontSize: 13, textAlign: "center" }}>
              No nodes match
            </div>
          )}
          {filtered.map((it, i) => {
            const active = i === index;
            return (
              <div
                key={it.kind + ":" + it.type}
                onMouseEnter={() => setIndex(i)}
                onClick={() => spawn(it)}
                style={{
                  padding: "8px 16px",
                  background: active ? "rgba(59,130,246,0.15)" : "transparent",
                  borderLeft: active ? "2px solid #3b82f6" : "2px solid transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                }}
              >
                <span style={{ width: 22, textAlign: "center", fontSize: 16 }}>
                  {it.kind === "native" ? (it.icon || "⬡") : "▪"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#e8e8f0", fontWeight: it.kind === "native" ? 600 : 500 }}>
                    {it.label}
                    {it.kind === "comfy" && (
                      <span style={{ fontSize: 10, color: "#888", marginLeft: 8 }}>{it.type}</span>
                    )}
                  </div>
                  {it.sub && (
                    <div style={{ color: "#888", fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {it.sub}
                    </div>
                  )}
                </div>
                <span style={{
                  fontSize: 9,
                  padding: "2px 6px",
                  borderRadius: 3,
                  background: it.kind === "native" ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)",
                  color: it.kind === "native" ? "#3b82f6" : "#888",
                  fontWeight: 600,
                  letterSpacing: 0.3,
                }}>
                  {it.kind === "native" ? "FS" : "COMFY"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
