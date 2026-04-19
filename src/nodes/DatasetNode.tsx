import { memo, useCallback, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import JSZip from "jszip";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt, getComfyUrl } from "../api/comfyApi";
import { log } from "../store/logStore";
import { uploadSourceImage, getConnectedImageUrl } from "../hooks/useNodeHelpers";
import { buildAutoCaptionWorkflow } from "../workflows/autocaption";

const MIN_SLOTS = 3;
const MAX_SLOTS = 30;
const DEFAULT_SLOTS = 6;

// Read connected text handle (for caption override)
function readConnectedText(nodeId: string, handle: string, nodes: any[], edges: any[]): string {
  const edge = edges.find((e: any) => e.target === nodeId && e.targetHandle === handle);
  if (!edge) return "";
  const src = nodes.find((n: any) => n.id === edge.source);
  return (src?.data as any)?.widgetValues?.text || "";
}

async function pollForText(promptId: string, maxAttempts = 300, interval = 1500): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, interval));
    try {
      const res = await fetch(`${getComfyUrl()}/api/history/${promptId}`);
      if (!res.ok) continue;
      const h = await res.json();
      const run = h[promptId];
      if (!run) continue;
      const outs = run.outputs || {};
      for (const nid of Object.keys(outs)) {
        const t = outs[nid]?.text;
        if (Array.isArray(t) && t.length && typeof t[0] === "string") return t.join("\n").trim();
        const s = outs[nid]?.string;
        if (Array.isArray(s) && s.length && typeof s[0] === "string") return s.join("\n").trim();
      }
      if (run.status?.status_str === "error") return null;
      if (run.status?.status_str === "success") return "";
    } catch { /* keep polling */ }
  }
  return null;
}

function DatasetNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; stage: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const slots: number = Math.min(MAX_SLOTS, Math.max(MIN_SLOTS, nodeData.widgetValues?._slots || DEFAULT_SLOTS));
  const model: "florence2" | "joycaption" = nodeData.widgetValues?.model || "joycaption";
  const prefix: string = nodeData.widgetValues?.prefix || "dataset";
  const captionType: string = nodeData.widgetValues?.captionType || "Descriptive";
  const captionLength: string = nodeData.widgetValues?.captionLength || "medium-length";
  const florenceTask: string = nodeData.widgetValues?.florenceTask || "detailed_caption";
  const triggerToken: string = (nodeData.widgetValues?.triggerToken || "").trim();
  const triggerPosition: "prefix" | "suffix" = nodeData.widgetValues?.triggerPosition || "prefix";
  const lastExport: { count: number; at: number } | null = nodeData.widgetValues?._lastExport || null;

  const addSlot = useCallback(() => {
    updateWidgetValue(id, "_slots", Math.min(MAX_SLOTS, slots + 1));
  }, [id, slots, updateWidgetValue]);
  const removeSlot = useCallback(() => {
    updateWidgetValue(id, "_slots", Math.max(MIN_SLOTS, slots - 1));
  }, [id, slots, updateWidgetValue]);

  const collectItems = useCallback(() => {
    const items: { url: string; caption: string; index: number }[] = [];
    for (let i = 0; i < slots; i++) {
      const url = getConnectedImageUrl(id, `img_${i}`, nodesAll as any[], edgesAll as any[]);
      if (!url) continue;
      const cap = readConnectedText(id, `cap_${i}`, nodesAll as any[], edgesAll as any[]);
      items.push({ url, caption: cap, index: i });
    }
    return items;
  }, [id, slots, nodesAll, edgesAll]);

  const handleExport = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    setError(null);

    const items = collectItems();
    if (items.length === 0) {
      setError("Connect at least one image");
      setProcessing(false);
      return;
    }

    log(`Dataset export: ${items.length} item(s)`, { nodeId: id, nodeType: "fs:dataset", nodeLabel: "Dataset" });

    try {
      // 1) auto-caption missing captions
      const needsCaption = items.filter((it) => !it.caption.trim());
      if (needsCaption.length > 0) {
        for (let i = 0; i < needsCaption.length; i++) {
          setProgress({ done: i, total: needsCaption.length, stage: "Captioning" });
          const it = needsCaption[i];
          const imgName = await uploadSourceImage(it.url, `fs_ds_${id}_${it.index}_${Date.now()}.png`);
          const wf = model === "florence2"
            ? buildAutoCaptionWorkflow({ model: "florence2", imageName: imgName, task: florenceTask })
            : buildAutoCaptionWorkflow({ model: "joycaption", imageName: imgName, captionType, captionLength });
          const r = await queuePrompt(wf);
          const text = await pollForText(r.prompt_id);
          it.caption = (text || "").trim() || "(no caption)";
        }
      }

      // 2) build ZIP
      setProgress({ done: 0, total: items.length, stage: "Packing" });
      const zip = new JSZip();
      for (let i = 0; i < items.length; i++) {
        setProgress({ done: i, total: items.length, stage: "Packing" });
        const it = items[i];
        const stem = `${prefix}_${String(i + 1).padStart(3, "0")}`;
        // fetch the image bytes
        const imgRes = await fetch(it.url);
        const imgBlob = await imgRes.blob();
        const imgBuf = await imgBlob.arrayBuffer();
        zip.file(`${stem}.png`, imgBuf);
        // Inject trigger token into final caption if configured.
        // Convention: separate with ", " — works for kohya/ai-toolkit tokenization.
        let finalCaption = it.caption;
        if (triggerToken) {
          finalCaption = triggerPosition === "prefix"
            ? `${triggerToken}, ${it.caption}`
            : `${it.caption}, ${triggerToken}`;
        }
        zip.file(`${stem}.txt`, finalCaption);
      }
      // a small manifest for reproducibility
      zip.file("_manifest.json", JSON.stringify({
        count: items.length,
        prefix,
        triggerToken: triggerToken || null,
        triggerPosition: triggerToken ? triggerPosition : null,
        captioner: needsCaption.length > 0 ? model : "user-provided",
        exportedAt: new Date().toISOString(),
      }, null, 2));

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${prefix}_dataset_${Date.now()}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);

      updateWidgetValue(id, "_lastExport", { count: items.length, at: Date.now() });
      log(`Dataset exported (${items.length})`, { nodeId: id, nodeType: "fs:dataset", status: "success" });
    } catch (err: any) {
      setError(err.message);
      log("Dataset export failed", { nodeId: id, nodeType: "fs:dataset", status: "error", details: err.message });
    }
    setProgress(null);
    setProcessing(false);
  }, [id, collectItems, model, prefix, captionType, captionLength, florenceTask, triggerToken, triggerPosition, updateWidgetValue]);

  const items = collectItems();
  const itemsWithCap = items.filter((i) => i.caption.trim()).length;
  const itemsAutoCap = items.length - itemsWithCap;

  const imgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const txtHL = connectingDir === "source" && (connectingType === "TEXT" || connectingType === "*") ? "highlight" : "";

  return (
    <div
      className={`dataset-node nanob-node ${selected ? "selected" : ""}`}
      style={{
        width: 420,
        borderColor: selected ? "#66bb6a" : undefined,
        boxShadow: selected ? "0 0 0 1px #66bb6a, 0 0 20px rgba(102,187,106,0.35), 0 8px 24px rgba(0,0,0,0.4)" : undefined,
      }}
      onClick={() => setSelectedNode(id)}
    >
      <div className="nanob-node-inner">
        <div className="nanob-accent" style={{ background: "#66bb6a" }} />
        <div className="nanob-header">
          <span className="nanob-icon" style={{ background: "rgba(102,187,106,0.15)" }}>📦</span>
          <div className="nanob-header-text">
            <span className="nanob-title">Dataset</span>
            <span className="nanob-status" style={{ color: "#66bb6a" }}>
              {processing
                ? (progress ? `${progress.stage} ${progress.done + 1}/${progress.total}` : "WORKING...")
                : `${items.length}/${slots} · ${itemsWithCap} text, ${itemsAutoCap} auto`}
            </span>
          </div>
        </div>
      </div>

      <div className="nanob-inputs" style={{ paddingTop: 4 }}>
        {Array.from({ length: slots }).map((_, i) => (
          <div key={i} style={{ position: "relative" }}>
            <div className="nanob-input-row">
              <Handle type="target" position={Position.Left} id={`img_${i}`} className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6", top: undefined }} />
              <TypeBadge color="#64b5f6">IMG</TypeBadge>
              <span className="nanob-input-label" style={{ fontSize: 11 }}>Image #{i + 1}</span>
              <Handle type="target" position={Position.Left} id={`cap_${i}`} className={`slot-handle ${txtHL}`} style={{ color: "#f0c040", top: 18 }} />
              <TypeBadge color="#f0c040">TXT</TypeBadge>
            </div>
          </div>
        ))}
      </div>

      <div className="nanob-ref-controls" style={{ padding: "2px 14px 4px", gap: 4, display: "flex", alignItems: "center" }}>
        <button className="nanob-ref-btn" onClick={(e) => { e.stopPropagation(); removeSlot(); }} disabled={slots <= MIN_SLOTS}>−</button>
        <span className="nanob-ref-count" style={{ fontSize: 10, color: "var(--text-muted)" }}>{slots} slots</span>
        <button className="nanob-ref-btn" onClick={(e) => { e.stopPropagation(); addSlot(); }} disabled={slots >= MAX_SLOTS}>+</button>
      </div>

      <div style={{
        margin: "8px 12px", padding: "10px 12px",
        background: "rgba(102,187,106,0.06)",
        border: "1px solid rgba(102,187,106,0.22)",
        borderRadius: 6, fontSize: 11, color: "#cfcfe8", lineHeight: 1.5,
      }}>
        Auto-caption model: <b style={{ color: "#66bb6a" }}>{model === "florence2" ? "Florence-2" : "JoyCaption"}</b>
        <br />
        Prefix: <b style={{ color: "#66bb6a" }}>{prefix}_XXX</b>
        {triggerToken && (
          <><br />Trigger ({triggerPosition}): <b style={{ color: "#66bb6a" }}>{triggerToken}</b></>
        )}
        {lastExport && (
          <><br /><span style={{ opacity: 0.7 }}>Last export: {lastExport.count} items · {new Date(lastExport.at).toLocaleTimeString()}</span></>
        )}
      </div>

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button
          className={`nanob-generate-btn ${processing ? "generating" : ""}`}
          style={{ background: processing ? "#2f5a33" : "#66bb6a", color: "#0d1a0e" }}
          onClick={handleExport}
          disabled={processing}
        >
          {processing ? "Exporting..." : `📦 Export ZIP (${items.length})`}
        </button>
      </div>
    </div>
  );
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="type-badge" style={{ color, borderColor: color + "66", backgroundColor: color + "12", fontSize: 9 }}>{children}</span>;
}

export default memo(DatasetNode);
