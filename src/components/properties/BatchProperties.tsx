import { useMemo } from "react";
import { useWorkflowStore } from "../../store/workflowStore";

// Node types that have a Run/Generate button (have data-fs-run-id wired up).
const RUNNABLE_TYPES = new Set([
  "fs:localGenerate", "fs:kontext", "fs:inpaintCN", "fs:inpaint",
  "fs:img2img", "fs:controlNet", "fs:nanoBanana",
  "fs:describe", "fs:critique", "fs:refine", "fs:imagen",
]);

const COMMON_PARAMS: Record<string, string[]> = {
  "fs:localGenerate": ["seed", "steps", "cfg", "width", "height"],
  "fs:kontext": ["seed", "steps", "cfg"],
  "fs:inpaintCN": ["seed", "steps", "guidance", "denoise", "cnStrength", "cnEndPercent"],
  "fs:inpaint": ["seed", "steps", "cfg", "denoise"],
  "fs:img2img": ["seed", "steps", "cfg", "denoise", "width", "height"],
  "fs:controlNet": ["seed", "steps", "cfg", "strength", "endPercent"],
  "fs:nanoBanana": ["seed", "temperature", "numImages"],
  "fs:describe": ["seed"],
  "fs:critique": ["temperature", "maxOutputTokens"],
  "fs:refine": ["temperature", "maxOutputTokens"],
  "fs:imagen": ["seed"],
};

function BatchProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const update = useWorkflowStore((s) => s.updateWidgetValue);
  const allNodes = useWorkflowStore((s) => s.nodes);
  const wv = data.widgetValues || {};
  const v = <T,>(k: string, d: T): T => (wv[k] !== undefined ? wv[k] : d);
  const mode: "list" | "matrix" = v("mode", "list");
  const targetNodeId: string = v("targetNodeId", "");

  const targets = useMemo(
    () => allNodes.filter((n) => RUNNABLE_TYPES.has((n.data as any).type)),
    [allNodes]
  );
  const targetType = (allNodes.find((n) => n.id === targetNodeId)?.data as any)?.type as string | undefined;
  const paramSuggestions = (targetType && COMMON_PARAMS[targetType]) || [];

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Mode</div>
        <select className="props-select" value={mode}
          onChange={(e) => update(nodeId, "mode", e.target.value)}>
          <option value="list">List (sweep one param)</option>
          <option value="matrix">Matrix (Cartesian product of two params)</option>
        </select>
      </div>

      <div className="props-section">
        <div className="props-section-title">Target Node</div>
        <select className="props-select" value={targetNodeId}
          onChange={(e) => update(nodeId, "targetNodeId", e.target.value)}>
          <option value="">— pick a node —</option>
          {targets.map((n) => (
            <option key={n.id} value={n.id}>
              {n.data.label || n.id} · {(n.data as any).type?.replace("fs:", "")}
            </option>
          ))}
        </select>
        {targets.length === 0 && (
          <p className="settings-hint" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            Add a generative node (LocalGen, Kontext, Inpaint, …) first.
          </p>
        )}
      </div>

      <div className="props-section">
        <div className="props-section-title">Param A</div>
        <input className="props-input" type="text" value={v("paramA", "seed")}
          list={`params-a-${nodeId}`}
          placeholder="widget key, e.g. seed"
          onChange={(e) => update(nodeId, "paramA", e.target.value)} />
        <datalist id={`params-a-${nodeId}`}>
          {paramSuggestions.map((p) => <option key={p} value={p} />)}
        </datalist>
      </div>
      <div className="props-section">
        <div className="props-section-title">Values A (one per line)</div>
        <textarea className="props-input" rows={6}
          value={v("valuesA", "")}
          placeholder={"e.g.\n3.5\n5.0\n7.0"}
          onChange={(e) => update(nodeId, "valuesA", e.target.value)} />
      </div>

      {mode === "matrix" && (
        <>
          <div className="props-section">
            <div className="props-section-title">Param B</div>
            <input className="props-input" type="text" value={v("paramB", "")}
              list={`params-b-${nodeId}`}
              placeholder="widget key, e.g. steps"
              onChange={(e) => update(nodeId, "paramB", e.target.value)} />
            <datalist id={`params-b-${nodeId}`}>
              {paramSuggestions.map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>
          <div className="props-section">
            <div className="props-section-title">Values B (one per line)</div>
            <textarea className="props-input" rows={6}
              value={v("valuesB", "")}
              placeholder={"e.g.\n8\n16\n24"}
              onChange={(e) => update(nodeId, "valuesB", e.target.value)} />
          </div>
        </>
      )}

      <details className="props-section props-temp-section">
        <summary className="props-temp-header">Advanced <span className="props-temp-badge">PRO</span></summary>
        <div className="props-section">
          <div className="props-section-title">Settle delay (ms)</div>
          <input type="range" className="props-range" min={50} max={2000} step={50}
            value={v("delayMs", 300)}
            onChange={(e) => update(nodeId, "delayMs", parseInt(e.target.value))} />
          <span className="props-range-value">{v("delayMs", 300)}</span>
          <p className="settings-hint" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            Delay between writing the new value and clicking Run, so React can settle.
          </p>
        </div>
      </details>

      <p className="settings-hint" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
        Each iteration writes the new value(s) to the target's widgetValues, then clicks its Run button and waits
        for completion. Results accumulate in the target node's history.
      </p>
    </>
  );
}

export default BatchProperties;
