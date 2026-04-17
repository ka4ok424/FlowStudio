import { useState, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useReactFlow } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { getAllNativeNodes } from "../nodes/registry";
import type { ComfyNodeDef } from "../api/comfyApi";

export default function NodeLibrary() {
  const { nodeDefs, addNode, pushUndo } = useWorkflowStore();
  const { getViewport } = useReactFlow();

  const addNodeAtCenter = useCallback((type: string) => {
    pushUndo();
    const { x, y, zoom } = getViewport();
    const centerX = (-x + window.innerWidth / 2) / zoom;
    const centerY = (-y + window.innerHeight / 2) / zoom;
    addNode(type, { x: centerX - 100, y: centerY - 50 });
  }, [addNode, pushUndo, getViewport]);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const tooltipTimer = useRef<number>(0);

  // Group by top-level category
  const categories = useMemo(() => {
    const cats: Record<string, { name: string; def: ComfyNodeDef }[]> = {};
    for (const [name, def] of Object.entries(nodeDefs)) {
      const topCat = def.category?.split("/")[0] || "Other";
      if (!cats[topCat]) cats[topCat] = [];

      if (search) {
        const q = search.toLowerCase();
        if (
          name.toLowerCase().includes(q) ||
          def.display_name?.toLowerCase().includes(q) ||
          def.category?.toLowerCase().includes(q)
        ) {
          cats[topCat].push({ name, def });
        }
      } else {
        cats[topCat].push({ name, def });
      }
    }

    // Remove empty categories
    for (const k of Object.keys(cats)) {
      if (cats[k].length === 0) delete cats[k];
    }

    return cats;
  }, [nodeDefs, search]);

  const toggleCat = (cat: string) => {
    const next = new Set(expanded);
    next.has(cat) ? next.delete(cat) : next.add(cat);
    setExpanded(next);
  };

  const handleDragStart = (e: React.DragEvent, nodeType: string) => {
    e.dataTransfer.setData("application/comfy-node-type", nodeType);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="node-library-content">
      <div className="library-header">
        <h2>Nodes</h2>
        <span className="node-count">{Object.keys(nodeDefs).length}</span>
      </div>

      <input
        className="library-search"
        type="text"
        placeholder="Search nodes..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="library-list">
        {/* ── Native FlowStudio nodes ─────────────────────────── */}
        {(() => {
          const allNative = getAllNativeNodes().filter((n) => !search || n.label.toLowerCase().includes(search.toLowerCase()));
          const localTypes = new Set(["fs:localGenerate", "fs:img2img", "fs:kontext", "fs:ltxVideo", "fs:nextFrame", "fs:upscale", "fs:inpaint", "fs:removeBg", "fs:compare", "fs:enhance", "fs:controlNet", "fs:inpaintCN", "fs:wanVideo", "fs:wanAnimate", "fs:hunyuanVideo", "fs:hunyuanAvatar", "fs:prompt", "fs:preview", "fs:import", "fs:characterCard", "fs:scene", "fs:storyboard", "fs:group", "fs:comment", "fs:describe"]);
          const localNodes = allNative.filter((n) => localTypes.has(n.type));
          const cloudNodes = allNative.filter((n) => !localTypes.has(n.type));

          const renderGrid = (nodes: typeof allNative) => (
            <div className="native-nodes-grid">
              {nodes.map((def) => (
                <div
                  key={def.type}
                  className="native-node-card"
                  style={{ "--card-accent": def.accentColor } as React.CSSProperties}
                  draggable
                  onDragStart={(e) => handleDragStart(e, def.type)}
                  onDoubleClick={() => addNodeAtCenter(def.type)}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    clearTimeout(tooltipTimer.current);
                    tooltipTimer.current = window.setTimeout(() => {
                      setTooltip({ text: def.description, x: rect.right + 4, y: rect.top });
                    }, 500);
                  }}
                  onMouseLeave={() => { clearTimeout(tooltipTimer.current); setTooltip(null); }}
                >
                  <span className="native-icon">{def.icon}</span>
                  <span className="native-label">{def.label}</span>
                </div>
              ))}
            </div>
          );

          return (
            <div className="library-category">
              <div className="native-section-header">Local</div>
              {renderGrid(localNodes)}
              {cloudNodes.length > 0 && (
                <>
                  <div className="native-section-divider" />
                  <div className="native-section-header">Cloud / API</div>
                  {renderGrid(cloudNodes)}
                </>
              )}
            </div>
          );
        })()}

        {/* ── ComfyUI nodes ───────────────────────────────────── */}
        {Object.entries(categories)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([catName, nodes]) => {
            const isOpen = search.length > 0 || expanded.has(catName);
            return (
              <div key={catName} className="library-category">
                <div className="category-header" onClick={() => toggleCat(catName)}>
                  <span className={`arrow ${isOpen ? "open" : ""}`}>&#9654;</span>
                  <span className="category-name">{catName}</span>
                  <span className="category-count">{nodes.length}</span>
                </div>

                {isOpen && (
                  <div className="category-nodes">
                    {nodes.map(({ name, def }) => (
                      <div
                        key={name}
                        className="library-node-card"
                        draggable
                        onDragStart={(e) => handleDragStart(e, name)}
                        onDoubleClick={() => addNodeAtCenter(name)}
                      >
                        <div className="card-name">{def.display_name || name}</div>
                        <div className="card-meta">
                          {Object.keys(def.input?.required || {}).length} in &middot;{" "}
                          {def.output?.length || 0} out
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Tooltip portal — renders outside sidebar DOM */}
      {tooltip && createPortal(
        <div className="fs-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.text}
        </div>,
        document.body
      )}
    </div>
  );
}
