import { memo, useCallback, useState, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt, getImageUrl, uploadImage, getComfyUrl, interruptGeneration } from "../api/comfyApi";
import { addGenerationToLibrary } from "../store/mediaStore";
import MediaHistory from "./MediaHistory";
import { addToHistory } from "../utils/historyLimit";
import { log } from "../store/logStore";
import { buildLtxVideoWorkflow } from "../workflows/ltxVideo";

function LtxVideoNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const previewUrl = nodeData.widgetValues?._previewUrl || null;
  const [processing, setProcessing] = useState(false);
  const [phase, setPhase] = useState<"idle" | "warmup" | "rendering">("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  // Helper: get image URL from connected node
  const getConnectedImage = (handleId: string): string | null => {
    const edge = edgesAll.find((e) => e.target === id && e.targetHandle === handleId);
    if (!edge) return null;
    const srcNode = nodesAll.find((n) => n.id === edge.source);
    if (!srcNode) return null;
    const sd = srcNode.data as any;
    return sd.widgetValues?._previewUrl || sd.widgetValues?._preview || sd.widgetValues?.portraitUrl || null;
  };

  const handleGenerate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    setError(null);
    abortRef.current = false;
    const startTime = Date.now();

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const steps = freshWv.steps || 8;
    const cfg = freshWv.cfg ?? 1.0;
    const width = freshWv.width || 768;
    const height = freshWv.height || 512;
    const frames = freshWv.frames || 41;
    const fps = freshWv.fps || 24;
    const maxLength = freshWv.maxLength || 512;
    const seed = freshWv.seed ? parseInt(freshWv.seed) : Math.floor(Math.random() * 2147483647);
    const negativePrompt = freshWv.negativePrompt || "";
    const stg = freshWv.stg ?? 0.6;
    const maxShift = freshWv.maxShift ?? 0.6;
    const baseShift = freshWv.baseShift ?? 0.6;
    const frameStrength = freshWv.frameStrength ?? 0.85;

    // Get prompt
    let promptText = "";
    const promptEdge = edgesAll.find((e) => e.target === id && e.targetHandle === "prompt");
    if (promptEdge) {
      const promptNode = nodesAll.find((n) => n.id === promptEdge.source);
      if (promptNode) promptText = (promptNode.data as any).widgetValues?.text || "";
    }
    if (!promptText) { setError("Connect a Prompt node"); setProcessing(false); setPhase("idle"); return; }

    // Get optional frame images
    const firstFrameUrl = getConnectedImage("first_frame");
    const midFrameUrl = getConnectedImage("mid_frame");
    const lastFrameUrl = getConnectedImage("last_frame");

    setPhase("rendering");
    log("LTX Video rendering", { nodeId: id, nodeType: "fs:ltxVideo", nodeLabel: "LTX Video" });

    try {
      // Upload frame images if connected
      const frameUploads: { url: string; idx: number }[] = [];
      const frameHandles = [["first_frame", 0], ["mid_frame", Math.floor(frames / 2)], ["last_frame", frames - 1]] as const;
      for (const [handle, idx] of frameHandles) {
        const edge = edgesAll.find((e) => e.target === id && e.targetHandle === handle);
        const url = handle === "first_frame" ? firstFrameUrl : handle === "mid_frame" ? midFrameUrl : lastFrameUrl;
        if (!url || !edge) continue;
        const fileName = `fs_ltx_${edge.source}_${handle}.png`;
        let imgName: string;
        if (url.startsWith("data:")) {
          imgName = await uploadImage(url, fileName);
        } else {
          const resp = await fetch(url);
          const blob = await resp.blob();
          const dataUrl = await new Promise<string>((r) => { const rd = new FileReader(); rd.onloadend = () => r(rd.result as string); rd.readAsDataURL(blob); });
          imgName = await uploadImage(dataUrl, fileName);
        }
        frameUploads.push({ url: imgName, idx });
      }

      // Build workflow
      // Build workflow using the official distilled pipeline
      const workflow = buildLtxVideoWorkflow({
        prompt: promptText, negativePrompt, seed, steps, cfg,
        width, height, frames, fps, stg, maxShift, baseShift, maxLength,
        guideFrames: frameUploads.map(f => ({ name: f.url, idx: f.idx })),
        frameStrength,
      });

      const result = await queuePrompt(workflow);
      const promptId = result.prompt_id;

      // Poll for result — video takes longer
      for (let attempt = 0; attempt < 300; attempt++) {
        if (abortRef.current) { setError("Stopped"); setProcessing(false); setPhase("idle"); return; }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          const histRes = await fetch(`${getComfyUrl()}/api/history/${promptId}`);
          if (!histRes.ok) continue;
          const history = await histRes.json();
          if (history[promptId]) {
            const outputs = history[promptId].outputs;
            for (const nId of Object.keys(outputs || {})) {
              // Check for videos (SaveVideo) or images (SaveAnimatedWEBP)
              const media = outputs[nId]?.videos || outputs[nId]?.images || outputs[nId]?.gifs;
              if (media && media.length > 0) {
                const img = media[0];
                const apiUrl = getImageUrl(img.filename, img.subfolder, img.type);

                updateWidgetValue(id, "_genTime", Date.now() - startTime);
                updateWidgetValue(id, "_previewUrl", apiUrl);
                const prevHist: string[] = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues?._history || [];
                const { history: newHist, index: newIdx } = await addToHistory(id, prevHist, apiUrl);
                updateWidgetValue(id, "_history", newHist);
                updateWidgetValue(id, "_historyIndex", newIdx);

                log("LTX Video complete", { nodeId: id, nodeType: "fs:ltxVideo", nodeLabel: "LTX Video", status: "success", details: `${frames}f ${steps}steps` });
                addGenerationToLibrary(apiUrl, {
                  prompt: promptText, model: "LTX-2.3", seed: String(seed),
                  steps, cfg, width, height, nodeType: "fs:ltxVideo",
                  duration: Date.now() - startTime,
                }, "video");
                setProcessing(false); setPhase("idle");
                return;
              }
            }
            const st = history[promptId].status;
            if (st?.completed || st?.status_str === "error") {
              const errMsg = history[promptId].status?.messages?.find((m: any) => m[0] === "execution_error");
              setError(errMsg ? errMsg[1]?.exception_message?.slice(0, 120) : "Generation failed");
              log("LTX Video failed", { nodeId: id, nodeType: "fs:ltxVideo", nodeLabel: "LTX Video", status: "error" });
              setProcessing(false); setPhase("idle");
              return;
            }
          }
        } catch { /* keep polling */ }
      }
      setError("Timeout"); setProcessing(false); setPhase("idle");
    } catch (err: any) {
      setError(err.message);
      log("LTX Video error", { nodeId: id, nodeType: "fs:ltxVideo", nodeLabel: "LTX Video", status: "error", details: err.message });
      setProcessing(false); setPhase("idle");
    }
  }, [id, edgesAll, nodesAll, updateWidgetValue]);

  const imgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const audioHL = connectingDir === "source" && (connectingType === "AUDIO" || connectingType === "*") ? "highlight" : "";
  const promptHL = connectingDir === "source" && (connectingType === "TEXT" || connectingType === "*") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "VIDEO" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(imgHL || audioHL || promptHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  const freshWv = nodeData.widgetValues || {};
  const frames = freshWv.frames || 41;
  const fps = freshWv.fps || 24;
  const duration = (frames / fps).toFixed(1);

  return (
    <div className={`ltxvideo-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="ltxvideo-node-inner">
        <div className="ltxvideo-accent" />
        <div className="ltxvideo-header">
          <span className="ltxvideo-icon">🎬</span>
          <div className="ltxvideo-header-text">
            <span className="ltxvideo-title">LTX Video</span>
            <span className="ltxvideo-status">{processing ? (phase === "warmup" ? "WARMING UP..." : "RENDERING...") : `${duration}s · ${frames}f`}</span>
          </div>
        </div>
      </div>

      <div className="ltxvideo-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="prompt" className={`slot-handle ${promptHL}`} style={{ color: "#f0c040" }} />
          <TypeBadge color="#f0c040">TXT</TypeBadge>
          <span className="nanob-input-label">Prompt</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="first_frame" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">First Frame</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="mid_frame" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Mid Frame</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="last_frame" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Last Frame</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="ref_audio" className={`slot-handle ${audioHL}`} style={{ color: "#e8a040" }} />
          <TypeBadge color="#e8a040">AUD</TypeBadge>
          <span className="nanob-input-label">Ref Audio</span>
        </div>
      </div>

      <MediaHistory
        nodeId={id}
        history={nodeData.widgetValues?._history || []}
        historyIndex={nodeData.widgetValues?._historyIndex ?? -1}
        fallbackUrl={previewUrl}
        emptyIcon="🎬"
        mediaType={previewUrl?.includes(".mp4") || previewUrl?.includes("format=mp4") ? "video" : "image"}
        genTime={nodeData.widgetValues?._genTime}
      />

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        {processing ? (
          <button className="localgen-generate-btn generating" onClick={(e) => {
            e.stopPropagation();
            abortRef.current = true;
            interruptGeneration().catch(() => {});
          }}>
            Stop
          </button>
        ) : (
          <div style={{ display: "flex", gap: 4 }}>
            <button className="localgen-generate-btn" onClick={handleGenerate} disabled={processing} style={{ flex: 1 }}>
              🎬 Generate Video
            </button>
            <button className="localgen-generate-btn" disabled={processing} onClick={async (ev) => {
              ev.stopPropagation();
              if (processing) return;
              setProcessing(true); setPhase("warmup"); setError(null);
              abortRef.current = false;
              let pt = "";
              const pEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "prompt");
              if (pEdge) { const pn = nodesAll.find((nd) => nd.id === pEdge.source); if (pn) pt = (pn.data as any).widgetValues?.text || ""; }
              if (!pt) { setError("Connect prompt"); setProcessing(false); setPhase("idle"); return; }
              const t = Date.now();
              const warmWv = (useWorkflowStore.getState().nodes.find(nd => nd.id === id)?.data as any)?.widgetValues || {};
              try {
                const { buildLtxWarmupWorkflow } = await import("../workflows/ltxVideo");
                const wf = buildLtxWarmupWorkflow(pt, Date.now() % 1000000, warmWv.fps || 24, warmWv.maxShift ?? 0.6, warmWv.baseShift ?? 0.6);
                console.log("[LTX] Manual warmup 128x128...");
                const warmRes = await queuePrompt(wf);
                console.log("[LTX] Warmup queued:", warmRes.prompt_id);
                for (let i = 0; i < 120; i++) {
                  if (abortRef.current) break;
                  await new Promise((resolve) => setTimeout(resolve, 2000));
                  try {
                    const res = await fetch(`${getComfyUrl()}/api/history/${warmRes.prompt_id}`);
                    if (!res.ok) continue;
                    const h = await res.json();
                    if (h[warmRes.prompt_id]) {
                      const out = h[warmRes.prompt_id].outputs;
                      for (const nId of Object.keys(out || {})) {
                        const media = out[nId]?.images || out[nId]?.animated;
                        if (media?.length) { updateWidgetValue(id, "_previewUrl", getImageUrl(media[0].filename, media[0].subfolder, media[0].type)); }
                      }
                      break;
                    }
                  } catch { /* retry */ }
                }
                updateWidgetValue(id, "_genTime", Date.now() - t);
                updateWidgetValue(id, "_lastInputHash", JSON.stringify({ promptText: pt, first: false, mid: false, last: false }));
              } catch (err: any) { setError(err.message); }
              setProcessing(false); setPhase("idle");
            }} style={{ padding: "0 10px" }} title="Warmup model">
              🔥
            </button>
          </div>
        )}
      </div>

      <div className="ltxvideo-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <TypeBadge color="#e85d75">VID</TypeBadge>
          <span className="nanob-output-label">Video</span>
          <Handle type="source" position={Position.Right} id="output_0" className={`slot-handle ${outputHL}`} style={{ color: "#e85d75" }} />
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="type-badge" style={{ color, borderColor: color + "66", backgroundColor: color + "12" }}>{children}</span>;
}

export default memo(LtxVideoNode);
