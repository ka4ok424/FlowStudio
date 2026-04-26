import { useWorkflowStore } from "../../store/workflowStore";

function MontageProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const edges = useWorkflowStore((s) => s.edges);

  const wv = data.widgetValues || {};
  const clipCount: number = wv.clipCount ?? 2;
  const audioMode: "keep" | "mute" = wv.audioMode || "keep";
  const trims: Record<string, { start: number; end: number }> = wv._clipTrims || {};

  // Count actually connected
  let connected = 0;
  let totalDur = 0;
  for (let i = 0; i < clipCount; i++) {
    const handleId = `video-${i}`;
    const edge = edges.find((e: any) => e.target === nodeId && e.targetHandle === handleId);
    if (edge) {
      connected++;
      const tr = trims[handleId];
      if (tr) totalDur += Math.max(0, (tr.end ?? 0) - (tr.start ?? 0));
    }
  }

  const onRunMontage = () => {
    alert("Render coming in Phase 2 (ffmpeg.wasm). Phase 1 = preview + trim only.");
  };

  return (
    <>
      <div className="props-info-card">
        <div className="props-info-header"><span>Montage</span></div>
        <p className="settings-hint" style={{ fontSize: 11, padding: "8px 0 0", lineHeight: 1.4 }}>
          Concatenates up to {10} video clips into a single output. Trim clips on the timeline, then Run to render.
        </p>
      </div>

      <div className="props-section">
        <div className="props-section-title">Audio Mode</div>
        <div className="props-aspect-row">
          <button
            className={`props-aspect-btn ${audioMode === "keep" ? "active" : ""}`}
            onClick={() => updateWidgetValue(nodeId, "audioMode", "keep")}
          >Keep Audio</button>
          <button
            className={`props-aspect-btn ${audioMode === "mute" ? "active" : ""}`}
            onClick={() => updateWidgetValue(nodeId, "audioMode", "mute")}
          >Mute All</button>
        </div>
      </div>

      <div className="props-info-card">
        <div className="props-info-header"><span>Info</span></div>
        <div className="props-info-rows">
          <div className="props-info-row">
            <span className="props-info-label">Connected clips</span>
            <span className="props-info-value">{connected}</span>
          </div>
          <div className="props-info-row">
            <span className="props-info-label">Total duration</span>
            <span className="props-info-value">{totalDur.toFixed(1)}s</span>
          </div>
        </div>
      </div>

      <button className="montage-run-btn" onClick={onRunMontage} style={{ width: "100%", marginTop: 8 }}>
        <span style={{ fontSize: 12 }}>▶</span> Run Montage
      </button>

      <p className="settings-hint" style={{ fontSize: 10, marginTop: 8, lineHeight: 1.4 }}>
        Connect videos → trim on timeline → Run. Output resolution matches the first clip. Max 90s total.
      </p>
    </>
  );
}

export default MontageProperties;
