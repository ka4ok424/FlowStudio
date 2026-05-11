import { useWorkflowStore } from "../../store/workflowStore";

// ── Next Frame Properties ────────────────────────────────────────
function NextFrameProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const { nodes: allNodes, edges: allEdges } = useWorkflowStore();
  const denoise = data.widgetValues?.denoise ?? 0.8;
  const steps = data.widgetValues?.steps ?? 8;
  const cfg = data.widgetValues?.cfg ?? 1.2;
  const seed = data.widgetValues?.seed ?? "";
  const negativePrompt = data.widgetValues?.negativePrompt ?? "";

  // Get seed from connected source node
  const inputEdge = allEdges.find((e: any) => e.target === nodeId && e.targetHandle === "input");
  const sourceNode = inputEdge ? allNodes.find((n: any) => n.id === inputEdge.source) : null;
  const sourceSeed = (sourceNode?.data as any)?.widgetValues?._lastSeed;

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Denoise</div>
        <input type="range" className="props-range" min={0.05} max={1.0} step={0.05} value={denoise}
          onChange={(e) => updateWidgetValue(nodeId, "denoise", parseFloat(e.target.value))} />
        <span className="props-range-value">{denoise.toFixed(2)}</span>
        <p className="settings-hint" style={{ marginTop: 4 }}>0.25-0.35 subtle change · 0.35-0.50 noticeable · 0.55+ risky</p>
      </div>
      <div className="props-section">
        <div className="props-section-title">Steps</div>
        <input type="range" className="props-range" min={4} max={20} step={1} value={steps}
          onChange={(e) => updateWidgetValue(nodeId, "steps", parseInt(e.target.value))} />
        <span className="props-range-value">{steps}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">CFG</div>
        <input type="range" className="props-range" min={1} max={20} step={0.5} value={cfg}
          onChange={(e) => updateWidgetValue(nodeId, "cfg", parseFloat(e.target.value))} />
        <span className="props-range-value">{cfg.toFixed(1)}</span>
      </div>
      <div className="props-section">
        <div className="props-section-title">Seed</div>
        <div className="props-input-row">
          <input type="number" className="props-input" value={seed}
            placeholder={sourceSeed ? `${sourceSeed} (⇥ Tab)` : "Random"}
            onChange={(e) => updateWidgetValue(nodeId, "seed", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Tab" && !seed && sourceSeed) {
                e.preventDefault();
                updateWidgetValue(nodeId, "seed", String(sourceSeed));
              }
            }} />
          <button className="props-dice-btn"
            onClick={() => updateWidgetValue(nodeId, "seed", Math.floor(Math.random() * 2147483647).toString())}>🎲</button>
        </div>
      </div>
      <details className="props-section props-temp-section">
        <summary className="props-temp-header">Advanced <span className="props-temp-badge">PRO</span></summary>
        <div className="props-section">
          <div className="props-section-title">Negative Prompt</div>
          <textarea className="props-textarea" value={negativePrompt} rows={3}
            onChange={(e) => updateWidgetValue(nodeId, "negativePrompt", e.target.value)} />
        </div>
      </details>
    </>
  );
}

export default NextFrameProperties;
