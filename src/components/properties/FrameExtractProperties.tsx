import { useWorkflowStore } from "../../store/workflowStore";

const SENTINEL_LAST = -1;

function FrameExtractProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);

  const wv = data.widgetValues || {};
  const frameIndex: number = wv.frameIndex ?? SENTINEL_LAST;
  const previewUrl: string | null = wv._previewUrl || null;
  const extractedFrame: number | null = wv._extractedFrame ?? null;
  const extractedSize: string | null = wv._extractedSize || null;

  const videoEdge = edges.find((e: any) => e.target === nodeId && e.targetHandle === "video");
  const srcNode = videoEdge ? nodes.find((n: any) => n.id === videoEdge.source) : null;
  const sd = srcNode?.data as any;
  const srcInfo = sd?.widgetValues?._fileInfo || {};
  const fps: number = typeof srcInfo.fps === "number" ? srcInfo.fps : 0;
  const totalFrames: number = typeof srcInfo.frames === "number" ? srcInfo.frames : 0;
  const resolution: string = srcInfo.resolution || "—";

  const isLastLocked = frameIndex === SENTINEL_LAST;
  const effectiveFrame = isLastLocked
    ? Math.max(0, totalFrames - 1)
    : Math.max(0, Math.min(frameIndex, Math.max(0, totalFrames - 1)));

  if (!videoEdge) {
    return <div className="props-empty">Connect a VIDEO input</div>;
  }

  return (
    <>
      {previewUrl && (
        <div className="props-preview">
          <img src={previewUrl} alt={`frame ${effectiveFrame}`} />
        </div>
      )}

      <div className="props-info-card">
        <div className="props-info-header">
          <span>SOURCE VIDEO</span>
        </div>
        <div className="props-info-rows">
          <div className="props-info-row">
            <span className="props-info-label">Resolution</span>
            <span className="props-info-value">{resolution}</span>
          </div>
          <div className="props-info-row">
            <span className="props-info-label">FPS</span>
            <span className="props-info-value">{fps || "—"}</span>
          </div>
          <div className="props-info-row">
            <span className="props-info-label">Total frames</span>
            <span className="props-info-value">{totalFrames || "—"}</span>
          </div>
        </div>
      </div>

      <div className="props-info-card">
        <div className="props-info-header">
          <span>EXTRACTED FRAME</span>
        </div>
        <div className="props-info-rows">
          <div className="props-info-row">
            <span className="props-info-label">Frame index</span>
            <span className="props-info-value">
              {effectiveFrame}
              {isLastLocked && <span style={{ marginLeft: 6, color: "#a78bfa", fontSize: 10 }}>(LAST)</span>}
            </span>
          </div>
          <div className="props-info-row">
            <span className="props-info-label">Output size</span>
            <span className="props-info-value">{extractedSize || (resolution !== "—" ? resolution : "—")}</span>
          </div>
          <div className="props-info-row">
            <span className="props-info-label">Format</span>
            <span className="props-info-value">PNG (lossless)</span>
          </div>
        </div>
      </div>

      {totalFrames > 0 && (
        <label className="props-field" onClick={(e) => e.stopPropagation()}>
          <span className="props-field-label">Frame index (manual)</span>
          <input
            type="number"
            min={0}
            max={totalFrames - 1}
            value={effectiveFrame}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              updateWidgetValue(nodeId, "frameIndex", isNaN(n) ? 0 : n);
            }}
          />
        </label>
      )}

      <button
        className="props-action-btn"
        onClick={() => updateWidgetValue(nodeId, "frameIndex", SENTINEL_LAST)}
        disabled={isLastLocked}
        style={{ marginTop: 8 }}
      >
        ↦ Lock to last frame
      </button>
    </>
  );
}

export default FrameExtractProperties;
