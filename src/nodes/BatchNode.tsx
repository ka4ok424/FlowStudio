import { memo, useCallback, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { log } from "../store/logStore";

// Coerce string value to int/float if it looks numeric.
function coerce(v: string): any {
  const t = v.trim();
  if (t === "") return "";
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  if (/^-?\d*\.\d+$/.test(t)) return parseFloat(t);
  if (t === "true" || t === "false") return t === "true";
  return t;
}

function parseList(s: string): any[] {
  return s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).map(coerce);
}

// Wait for the targeted node to finish — it leaves the "generating" class on its
// run button while busy. We poll the DOM until the button is no longer disabled
// (or until a hard timeout).
async function waitForRunDone(nodeId: string, timeoutMs = 5 * 60_000): Promise<boolean> {
  const start = Date.now();
  // small initial delay so the click had a chance to set the disabled state
  await new Promise((r) => setTimeout(r, 200));
  while (Date.now() - start < timeoutMs) {
    const btn = document.querySelector(`[data-fs-run-id="${nodeId}"]`) as HTMLButtonElement | null;
    if (!btn) return false;
    if (!btn.disabled && !btn.classList.contains("generating")) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function BatchNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);

  const wv = nodeData.widgetValues || {};
  const targetNodeId: string = wv.targetNodeId || "";
  const mode: "list" | "matrix" = wv.mode || "list";
  const paramA: string = wv.paramA || "seed";
  const valuesA: string = wv.valuesA || "";
  const paramB: string = wv.paramB || "";
  const valuesB: string = wv.valuesB || "";
  const delayMs: number = wv.delayMs ?? 300;

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allNodes = useWorkflowStore((s) => s.nodes);
  const targetNode = allNodes.find((n) => n.id === targetNodeId);

  const runBatch = useCallback(async () => {
    setError(null);
    if (!targetNodeId) { setError("Pick a target node in the Inspector"); return; }
    const target = useWorkflowStore.getState().nodes.find((n) => n.id === targetNodeId);
    if (!target) { setError("Target node no longer exists"); return; }
    const targetBtn = document.querySelector(`[data-fs-run-id="${targetNodeId}"]`) as HTMLButtonElement | null;
    if (!targetBtn) { setError("Target node has no Run button visible"); return; }

    const listA = parseList(valuesA);
    const listB = mode === "matrix" ? parseList(valuesB) : [null];
    if (listA.length === 0) { setError("Provide at least one value for param A"); return; }
    if (mode === "matrix" && listB.length === 0) { setError("Provide values for param B in matrix mode"); return; }

    const total = listA.length * listB.length;
    setRunning(true);
    log(`Batch start (${mode}) → ${target.data.label || target.id}, total ${total}`,
        { nodeId: id, nodeType: "fs:batch", nodeLabel: "Batch", details: `${paramA}${mode === "matrix" ? `×${paramB}` : ""}` });

    let done = 0;
    try {
      for (const a of listA) {
        for (const b of listB) {
          const label = mode === "matrix" ? `${paramA}=${a}, ${paramB}=${b}` : `${paramA}=${a}`;
          setProgress({ done, total, current: label });
          updateWidgetValue(targetNodeId, paramA, a);
          if (mode === "matrix") updateWidgetValue(targetNodeId, paramB, b);
          // wait a tick for React to apply the widget update before the click
          await new Promise((r) => setTimeout(r, Math.max(50, delayMs)));
          const btn = document.querySelector(`[data-fs-run-id="${targetNodeId}"]`) as HTMLButtonElement | null;
          if (!btn) throw new Error("Target Run button vanished mid-batch");
          btn.click();
          const ok = await waitForRunDone(targetNodeId);
          if (!ok) throw new Error(`Iteration timeout at ${label}`);
          done += 1;
          log(`Batch ${done}/${total}: ${label}`, { nodeId: id, nodeType: "fs:batch", status: "success" });
        }
      }
    } catch (err: any) {
      setError(err.message);
      log(`Batch failed: ${err.message}`, { nodeId: id, nodeType: "fs:batch", status: "error" });
    }
    setProgress(null);
    setRunning(false);
  }, [id, targetNodeId, mode, paramA, paramB, valuesA, valuesB, delayMs, updateWidgetValue]);

  const totalEstimate = parseList(valuesA).length * (mode === "matrix" ? Math.max(1, parseList(valuesB).length) : 1);

  return (
    <div
      className={`batch-node nanob-node ${selected ? "selected" : ""}`}
      style={{
        width: 360,
        borderColor: selected ? "#ec407a" : undefined,
        boxShadow: selected ? "0 0 0 1px #ec407a, 0 0 20px rgba(236,64,122,0.35), 0 8px 24px rgba(0,0,0,0.4)" : undefined,
      }}
      onClick={() => setSelectedNode(id)}
    >
      <div className="nanob-node-inner">
        <div className="nanob-accent" style={{ background: "#ec407a" }} />
        <div className="nanob-header">
          <span className="nanob-icon" style={{ background: "rgba(236,64,122,0.15)" }}>🎲</span>
          <div className="nanob-header-text">
            <span className="nanob-title">Batch · {mode}</span>
            <span className="nanob-status" style={{ color: "#ec407a" }}>
              {running
                ? (progress ? `${progress.done + 1}/${progress.total} · ${progress.current.slice(0, 28)}` : "RUNNING...")
                : (targetNode ? `→ ${targetNode.data.label || targetNode.id} · ${totalEstimate} runs` : "no target")}
            </span>
          </div>
        </div>
      </div>

      <div style={{
        margin: "8px 12px", padding: "10px 12px",
        background: "rgba(236,64,122,0.06)",
        border: "1px solid rgba(236,64,122,0.22)",
        borderRadius: 6, fontSize: 11, color: "#cfcfe8", lineHeight: 1.55,
      }}>
        {!targetNodeId && <span style={{ opacity: 0.7 }}>Open Inspector → pick a Target node and a Param.</span>}
        {targetNodeId && (
          <>
            Target: <b style={{ color: "#ec407a" }}>{targetNode?.data.label || targetNodeId}</b><br />
            {mode === "list"
              ? <>Vary <b>{paramA}</b> over <b>{parseList(valuesA).length}</b> values</>
              : <>Matrix: <b>{paramA}</b>({parseList(valuesA).length}) × <b>{paramB}</b>({parseList(valuesB).length})</>}
          </>
        )}
      </div>

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button
          className={`nanob-generate-btn ${running ? "generating" : ""}`}
          style={{ background: running ? "#7a2541" : "#ec407a", color: "#fff" }}
          onClick={(e) => { e.stopPropagation(); runBatch(); }}
          disabled={running || !targetNodeId}
        >
          {running ? "Running..." : `🎲 Run batch (${totalEstimate})`}
        </button>
      </div>
    </div>
  );
}

export default memo(BatchNode);
