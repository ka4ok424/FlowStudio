import { useEffect, useRef, useState, useCallback } from "react";
import { useStore, type NodeChange, type Node } from "@xyflow/react";

const SNAP_PX = 4;
const GUIDE_COLOR = "rgba(255, 255, 255, 0.12)";

interface Guide {
  dir: "v" | "h";
  pos: number;
  from: number;
  to: number;
}

export function useSnappingNodes() {
  const [guides, setGuides] = useState<Guide[]>([]);
  const shiftRef = useRef(false);
  const dragStartRef = useRef<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    const d = (e: KeyboardEvent) => { if (e.key === "Shift") shiftRef.current = true; };
    const u = (e: KeyboardEvent) => { if (e.key === "Shift") shiftRef.current = false; };
    window.addEventListener("keydown", d);
    window.addEventListener("keyup", u);
    return () => { window.removeEventListener("keydown", d); window.removeEventListener("keyup", u); };
  }, []);

  // Wrap onNodesChange to intercept position changes
  const wrapNodesChange = useCallback(
    (originalHandler: (changes: NodeChange[]) => void, allNodes: Node[]) => {
      return (changes: NodeChange[]) => {
        const newGuides: Guide[] = [];

        const modified = changes.map((change: any) => {
          // Only intercept position changes while dragging
          if (change.type !== "position" || !change.position) {
            return change;
          }

          // On release: don't re-snap, just keep current snapped position
          if (!change.dragging) {
            const node = allNodes.find((n) => n.id === change.id);
            if (node && dragStartRef.current[change.id]) {
              // Use node's current position (already snapped) instead of React Flow's final position
              change = { ...change, position: { ...node.position } };
            }
            delete dragStartRef.current[change.id];
            return change;
          }

          let { x, y } = change.position;
          const dragNode = allNodes.find((n) => n.id === change.id);
          if (!dragNode?.measured?.width || !dragNode?.measured?.height) return change;

          const dw = dragNode.measured.width;
          const dh = dragNode.measured.height;

          // Save drag start
          if (!dragStartRef.current[change.id]) {
            dragStartRef.current[change.id] = { x, y };
          }

          // Shift: constrain to one axis
          if (shiftRef.current) {
            const start = dragStartRef.current[change.id];
            const dx = Math.abs(x - start.x);
            const dy = Math.abs(y - start.y);
            if (dx > dy) y = start.y;
            else x = start.x;
          }

          // Snap to other nodes
          for (const n of allNodes) {
            if (n.id === change.id || !n.measured?.width || !n.measured?.height) continue;

            const nw = n.measured.width;
            const nh = n.measured.height;
            const nx = n.position.x;
            const ny = n.position.y;

            // X snap
            const xChecks: [number, number][] = [
              [x, nx], [x, nx + nw], [x + dw, nx], [x + dw, nx + nw],
              [x + dw / 2, nx + nw / 2],
            ];
            for (const [d, t] of xChecks) {
              if (Math.abs(d - t) < SNAP_PX) {
                x += t - d;
                newGuides.push({
                  dir: "v", pos: t,
                  from: Math.min(y, ny),
                  to: Math.max(y + dh, ny + nh),
                });
                break;
              }
            }

            // Y snap (no center-y)
            const yChecks: [number, number][] = [
              [y, ny], [y, ny + nh], [y + dh, ny], [y + dh, ny + nh],
            ];
            for (const [d, t] of yChecks) {
              if (Math.abs(d - t) < SNAP_PX) {
                y += t - d;
                newGuides.push({
                  dir: "h", pos: t,
                  from: Math.min(x, nx),
                  to: Math.max(x + dw, nx + nw),
                });
                break;
              }
            }
          }

          return { ...change, position: { x, y } };
        });

        // Update guides
        const hasDragging = changes.some((c: any) => c.type === "position" && c.dragging);
        setGuides(hasDragging ? newGuides : []);

        originalHandler(modified);
      };
    },
    []
  );

  return { guides, wrapNodesChange };
}

export default function AlignmentGuidesOverlay({ guides }: { guides: Guide[] }) {
  const [tx, ty, scale] = useStore((s) => s.transform);
  if (guides.length === 0) return null;

  return (
    <svg className="alignment-guides">
      {guides.map((g, i) =>
        g.dir === "v" ? (
          <line key={i}
            x1={g.pos * scale + tx} y1={g.from * scale + ty}
            x2={g.pos * scale + tx} y2={g.to * scale + ty}
            stroke={GUIDE_COLOR} strokeWidth={1} strokeDasharray="4 3"
          />
        ) : (
          <line key={i}
            x1={g.from * scale + tx} y1={g.pos * scale + ty}
            x2={g.to * scale + tx} y2={g.pos * scale + ty}
            stroke={GUIDE_COLOR} strokeWidth={1} strokeDasharray="4 3"
          />
        )
      )}
    </svg>
  );
}
