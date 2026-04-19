import { useWorkflowStore } from "../../store/workflowStore";

/**
 * Pink "×N attempts" slider. Reused across all generative nodes that support
 * batch runs. The pink colour is intentional — it's the universal "variations"
 * marker so users instantly recognise that this control multiplies the work.
 */
export default function BatchCountField({ nodeId, value }: { nodeId: string; value?: number }) {
  const update = useWorkflowStore((s) => s.updateWidgetValue);
  const v = value ?? 1;
  return (
    <div className="props-section">
      <div className="props-section-title">Batch Count</div>
      <div className="props-slider-row">
        <input type="range" className="props-slider" min={1} max={20} step={1} value={v}
          style={{ accentColor: "#ec407a" }}
          onChange={(e) => update(nodeId, "count", parseInt(e.target.value))} />
        <span className="props-slider-value" style={{ color: "#ec407a", fontWeight: 700 }}>×{v}</span>
      </div>
      {v > 1 && (
        <p className="settings-hint" style={{ marginTop: 4, fontSize: 11, color: "var(--text-muted)" }}>
          Seed randomized each run.
        </p>
      )}
    </div>
  );
}
