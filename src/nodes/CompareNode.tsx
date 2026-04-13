import { memo, useState, useRef, useCallback, useEffect } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";

function CompareNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const [sliderPos, setSliderPos] = useState(50);
  const draggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const getImage = (handleId: string): string | null => {
    const edge = edgesAll.find((e) => e.target === id && e.targetHandle === handleId);
    if (!edge) return null;
    const src = nodesAll.find((n) => n.id === edge.source);
    if (!src) return null;
    const sd = src.data as any;
    return sd.widgetValues?._previewUrl || sd.widgetValues?._preview || sd.widgetValues?.portraitUrl || null;
  };

  const imageA = getImage("image_a");
  const imageB = getImage("image_b");

  const updateSlider = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setSliderPos(x);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    updateSlider(e.clientX);
  }, [updateSlider]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingRef.current) updateSlider(e.clientX);
    };
    const onUp = () => { draggingRef.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [updateSlider]);

  const imgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!imgHL : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  return (
    <div className={`compare-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="compare-node-inner">
        <div className="compare-accent" />
        <div className="compare-header">
          <span className="compare-icon">⚖️</span>
          <div className="compare-header-text">
            <span className="compare-title">Compare</span>
            <span className="compare-status">A / B</span>
          </div>
        </div>
      </div>

      <div className="compare-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="image_a" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Image A (left)</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="image_b" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Image B (right)</span>
        </div>
      </div>

      <div className="compare-preview nodrag">
        {imageA && imageB ? (
          <div
            ref={containerRef}
            className="compare-slider-wrap"
            onMouseDown={handleMouseDown}
          >
            {/* Image A — left side, clipped from right */}
            <div className="compare-side-a" style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}>
              <img src={imageA} alt="A" className="compare-img" />
            </div>
            {/* Image B — right side, clipped from left */}
            <div className="compare-side-b" style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}>
              <img src={imageB} alt="B" className="compare-img" />
            </div>
            {/* Slider line */}
            <div className="compare-line" style={{ left: `${sliderPos}%` }}>
              <div className="compare-handle">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <polyline points="15 18 9 12 15 6" />
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </div>
            {/* Labels */}
            <span className="compare-label-a">A</span>
            <span className="compare-label-b">B</span>
          </div>
        ) : (
          <div className="nanob-preview-empty">
            <span className="nanob-preview-logo">⚖️</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="type-badge" style={{ color, borderColor: color + "66", backgroundColor: color + "12" }}>{children}</span>;
}

export default memo(CompareNode);
