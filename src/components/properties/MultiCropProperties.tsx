import { useWorkflowStore } from "../../store/workflowStore";

interface CellRect { x: number; y: number; w: number; h: number }

function MultiCropProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);

  const wv = data.widgetValues || {};
  // Manual cells live under `_detectedCells` (key kept for backward
  // compatibility — extraction effect reads this key).
  const cells: CellRect[] = wv._detectedCells || [];
  const cellPreviews: Record<string, string> = wv._cellPreviews || {};

  const inputEdge = edges.find((e: any) => e.target === nodeId && e.targetHandle === "input");
  const srcNode = inputEdge ? nodes.find((n: any) => n.id === inputEdge.source) : null;
  const sd = srcNode?.data as any;
  const srcResolution: string = sd?.widgetValues?._fileInfo?.resolution || "—";

  if (!inputEdge) {
    return <div className="props-empty">Connect an IMAGE input</div>;
  }

  const totalCells = cells.length;
  const cellsExtracted = Object.keys(cellPreviews).length;
  const previewCols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(totalCells))));

  const removeCell = (i: number) => {
    const next = cells.filter((_, j) => j !== i);
    updateWidgetValue(nodeId, "_detectedCells", next);
  };
  const clearAll = () => {
    updateWidgetValue(nodeId, "_detectedCells", []);
  };

  return (
    <>
      <div className="props-info-card">
        <div className="props-info-header"><span>SOURCE</span></div>
        <div className="props-info-rows">
          <div className="props-info-row">
            <span className="props-info-label">Resolution</span>
            <span className="props-info-value">{srcResolution}</span>
          </div>
        </div>
      </div>

      <div className="props-info-card">
        <div className="props-info-header"><span>CELLS</span></div>
        <div className="props-info-rows">
          <div className="props-info-row">
            <span className="props-info-label">Drawn</span>
            <span className="props-info-value">{totalCells}</span>
          </div>
          <div className="props-info-row">
            <span className="props-info-label">Extracted</span>
            <span className="props-info-value">{cellsExtracted} / {totalCells}</span>
          </div>
        </div>
      </div>

      <p className="settings-hint" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4 }}>
        Cells are drawn manually in the fullscreen editor. Open it from the node card —
        drag the first rect to set cell size, then click to add more of the same size,
        or switch to Resize mode for corner-handle adjustments.
      </p>

      {totalCells > 0 && (
        <div className="props-section">
          <div className="props-section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Cells</span>
            <button
              className="props-clear-btn"
              onClick={clearAll}
              style={{ fontSize: 10, padding: "2px 8px", background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer" }}
              title="Remove all cells"
            >Clear all</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${previewCols}, 1fr)`, gap: 4 }}>
            {cells.map((cell, i) => {
              const handleId = `out_${i + 1}`;
              const url = cellPreviews[handleId];
              return (
                <div key={handleId} style={{ position: "relative" }} className="mc-prop-cell">
                  {url ? (
                    <img src={url} alt={handleId} style={{ width: "100%", display: "block", borderRadius: 4 }} />
                  ) : (
                    <div style={{ aspectRatio: `${cell.w} / ${cell.h}`, background: "#1a1a1f", borderRadius: 4 }} />
                  )}
                  <span style={{
                    position: "absolute", top: 2, left: 2,
                    background: "rgba(0,0,0,0.7)", color: "#fff",
                    fontSize: 9, padding: "1px 4px", borderRadius: 2,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  }}>{i + 1}</span>
                  <span style={{
                    position: "absolute", bottom: 2, right: 2,
                    background: "rgba(0,0,0,0.6)", color: "#9098a8",
                    fontSize: 9, padding: "1px 4px", borderRadius: 2,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  }}>{cell.w}×{cell.h}</span>
                  <button
                    onClick={() => removeCell(i)}
                    title="Delete cell"
                    style={{
                      position: "absolute", top: 2, right: 2,
                      width: 18, height: 18, border: "none",
                      background: "rgba(0,0,0,0.7)", color: "#fff",
                      borderRadius: 9, fontSize: 12, lineHeight: "16px",
                      cursor: "pointer", padding: 0,
                    }}
                  >×</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

export default MultiCropProperties;
