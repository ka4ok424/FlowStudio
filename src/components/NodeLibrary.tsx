import { useState, useMemo } from "react";
import { useWorkflowStore } from "../store/workflowStore";
import type { ComfyNodeDef } from "../api/comfyApi";

export default function NodeLibrary() {
  const { nodeDefs, addNode } = useWorkflowStore();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
    <div className="node-library">
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
                        onDoubleClick={() => addNode(name, { x: 400, y: 300 })}
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
    </div>
  );
}
