import { useWorkflowStore } from "../../store/workflowStore";

interface CellRect { x: number; y: number; w: number; h: number }

function MultiCropProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);

  const wv = data.widgetValues || {};
  const detectedCells: CellRect[] = wv._detectedCells || [];
  const cellPreviews: Record<string, string> = wv._cellPreviews || {};
  const autoDetectOnConnect: boolean = wv.autoDetectOnConnect ?? true;

  const inputEdge = edges.find((e: any) => e.target === nodeId && e.targetHandle === "input");
  const srcNode = inputEdge ? nodes.find((n: any) => n.id === inputEdge.source) : null;
  const sd = srcNode?.data as any;
  const srcResolution: string = sd?.widgetValues?._fileInfo?.resolution || "—";

  if (!inputEdge) {
    return <div className="props-empty">Connect an IMAGE input</div>;
  }

  const totalCells = detectedCells.length;
  const cellsExtracted = Object.keys(cellPreviews).length;

  // Pick a reasonable preview-grid column count (max 4 cols)
  const previewCols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(totalCells))));

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
        <div className="props-info-header"><span>DETECTION</span></div>
        <div className="props-info-rows">
          <div className="props-info-row">
            <span className="props-info-label">Cells found</span>
            <span className="props-info-value">{totalCells}</span>
          </div>
          <div className="props-info-row">
            <span className="props-info-label">Extracted</span>
            <span className="props-info-value">{cellsExtracted} / {totalCells}</span>
          </div>
        </div>
      </div>

      <div className="props-section">
        <label className="props-check-row" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={autoDetectOnConnect}
            onChange={(e) => updateWidgetValue(nodeId, "autoDetectOnConnect", e.target.checked)}
          />
          <span>Auto-detect on input change</span>
        </label>
        <p className="settings-hint" style={{ fontSize: 10, marginTop: 4 }}>
          When enabled, detection runs automatically every time a new image is connected. Disable if you want full manual control.
        </p>
      </div>

      {totalCells > 0 && (
        <div className="props-section">
          <div className="props-section-title">Detected cells</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${previewCols}, 1fr)`, gap: 4 }}>
            {detectedCells.map((cell, i) => {
              const handleId = `out_${i + 1}`;
              const url = cellPreviews[handleId];
              return (
                <div key={handleId} style={{ position: "relative" }}>
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
