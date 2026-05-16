import { memo, useCallback, useState, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt, getImageUrl, uploadImage, getComfyUrl, stopAll } from "../api/comfyApi";
import { addGenerationToLibrary } from "../store/mediaStore";
import MediaHistory from "./MediaHistory";
import { addToHistory } from "../utils/historyLimit";
import { log } from "../store/logStore";
import { buildLtxFmlWorkflow } from "../workflows/ltxFml";

function LtxFmlNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const previewUrl = nodeData.widgetValues?._previewUrl || null;
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const getConnectedMedia = (handleId: string): string | null => {
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
    const width = freshWv.width || 720;
    const height = freshWv.height || 1280;
    const frames = freshWv.frames || 121;
    const fps = freshWv.fps || 24;
    const cfg = freshWv.cfg ?? 1.0;
    const steps = freshWv.steps || 8;
    const seed = freshWv.seed ? parseInt(freshWv.seed) : Math.floor(Math.random() * 2147483647);
    const firstFrameStrength = freshWv.firstFrameStrength ?? 0.7;
    const middleFrameStrength = freshWv.middleFrameStrength ?? 0.3;
    const lastFrameStrength = freshWv.lastFrameStrength ?? 1.0;
    const promptEnhancer = freshWv.promptEnhancer ?? false;

    let promptText = "";
    const promptEdge = edgesAll.find((ed) => ed.target === id && ed.targetHandle === "prompt");
    if (promptEdge) {
      const srcNode = nodesAll.find((n) => n.id === promptEdge.source);
      if (srcNode) promptText = (srcNode.data as any).widgetValues?.text || "";
    }
    if (!promptText) { setError("Connect a Prompt node"); setProcessing(false); return; }

    const firstFrameUrl  = getConnectedMedia("first_frame");
    const middleFrameUrl = getConnectedMedia("middle_frame");
    const lastFrameUrl   = getConnectedMedia("last_frame");
    if (!firstFrameUrl)  { setError("Connect FIRST FRAME (IMAGE)");  setProcessing(false); return; }
    if (!middleFrameUrl) { setError("Connect MIDDLE FRAME (IMAGE)"); setProcessing(false); return; }
    if (!lastFrameUrl)   { setError("Connect LAST FRAME (IMAGE)");   setProcessing(false); return; }

    log("LTX FML rendering", { nodeId: id, nodeType: "fs:ltxFml", nodeLabel: "LTX 2.3 FML" });

    try {
      const fetchToDataUrl = async (url: string): Promise<string> => {
        if (url.startsWith("data:")) return url;
        const resp = await fetch(url);
        const blob = await resp.blob();
        return await new Promise<string>((r) => {
          const rd = new FileReader();
          rd.onloadend = () => r(rd.result as string);
          rd.readAsDataURL(blob);
        });
      };
      const ts = Date.now();
      const firstName  = await uploadImage(await fetchToDataUrl(firstFrameUrl),  `fs_ltxfml_ff_${id}_${ts}.png`);
      const middleName = await uploadImage(await fetchToDataUrl(middleFrameUrl), `fs_ltxfml_mf_${id}_${ts}.png`);
      const lastName   = await uploadImage(await fetchToDataUrl(lastFrameUrl),   `fs_ltxfml_lf_${id}_${ts}.png`);

      const workflow = buildLtxFmlWorkflow({
        prompt: promptText,
        width, height, fps, frames,
        cfg, steps, seed,
        firstFrameStrength, middleFrameStrength, lastFrameStrength,
        promptEnhancer,
        firstFrameFile: firstName,
        middleFrameFile: middleName,
        lastFrameFile: lastName,
      });

      const result = await queuePrompt(workflow);
      const promptId = result.prompt_id;

      for (let attempt = 0; attempt < 600; attempt++) {
        if (abortRef.current) { setError("Stopped"); setProcessing(false); return; }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          const histRes = await fetch(`${getComfyUrl()}/api/history/${promptId}`);
          if (!histRes.ok) continue;
          const history = await histRes.json();
          if (history[promptId]) {
            const outputs = history[promptId].outputs;
            for (const nId of Object.keys(outputs || {})) {
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
                log("LTX FML complete", { nodeId: id, nodeType: "fs:ltxFml", nodeLabel: "LTX 2.3 FML", status: "success", details: `${frames}f ${width}x${height}` });
                addGenerationToLibrary(apiUrl, {
                  prompt: promptText, model: "LTX 2.3 22B FML2V", seed: String(seed),
                  steps, cfg, width, height, nodeType: "fs:ltxFml",
                  duration: Date.now() - startTime,
                }, "video");
                setProcessing(false);
                return;
              }
            }
            const st = history[promptId].status;
            if (st?.completed || st?.status_str === "error") {
              const messages = history[promptId].status?.messages || [];
              const execErr = messages.find((m: any) => m[0] === "execution_error");
              const executedOutputs = Object.keys(history[promptId].outputs || {});
              // eslint-disable-next-line no-console
              console.group("[LTX FML] no media output — full diagnostics");
              // eslint-disable-next-line no-console
              console.log("status:", st, "messages:", messages, "outputs:", executedOutputs);
              // eslint-disable-next-line no-console
              console.log("full history entry:", history[promptId]);
              // eslint-disable-next-line no-console
              console.groupEnd();
              let errLine = "Generation finished with no video output.";
              if (execErr) {
                const ex = execErr[1] || {};
                errLine = `${ex.node_type || "?"} (#${ex.node_id ?? "?"}): ${(ex.exception_message || "").slice(0, 240)}`;
              } else {
                errLine += ` Only ran: ${executedOutputs.join(", ") || "(none)"}. Check ComfyUI server log.`;
              }
              setError(errLine);
              log("LTX FML failed", { nodeId: id, nodeType: "fs:ltxFml", nodeLabel: "LTX 2.3 FML", status: "error", details: errLine });
              setProcessing(false);
              return;
            }
          }
        } catch { /* keep polling */ }
      }
      setError("Timeout"); setProcessing(false);
    } catch (err: any) {
      setError(err.message);
      log("LTX FML error", { nodeId: id, nodeType: "fs:ltxFml", nodeLabel: "LTX 2.3 FML", status: "error", details: err.message });
      setProcessing(false);
    }
  }, [id, edgesAll, nodesAll, updateWidgetValue]);

  const txtHL = connectingDir === "source" && (connectingType === "TEXT" || connectingType === "*") ? "highlight" : "";
  const imgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const outHL = connectingDir === "target" && (connectingType === "VIDEO" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const hasCompat = connectingType ? !!(txtHL || imgHL || outHL) : false;
  const dimClass = connectingType ? (hasCompat ? "compatible" : "incompatible") : "";

  const wv = nodeData.widgetValues || {};
  const frames = wv.frames ?? 121;
  const fps = wv.fps ?? 24;
  const duration = (frames / fps).toFixed(1);

  return (
    <div className={`ltxvideo-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="ltxvideo-node-inner">
        <div className="ltxvideo-accent" />
        <div className="ltxvideo-header">
          <span className="ltxvideo-icon">🎬</span>
          <div className="ltxvideo-header-text">
            <span className="ltxvideo-title">LTX 2.3 FML</span>
            <span className="ltxvideo-status">{processing ? "RENDERING..." : `${frames}f · ${duration}s · ${wv.width ?? 720}×${wv.height ?? 1280}`}</span>
          </div>
        </div>
      </div>

      <div className="ltxvideo-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="prompt" className={`slot-handle ${txtHL}`} style={{ color: "#f0c040" }} />
          <TypeBadge color="#f0c040">TXT</TypeBadge>
          <span className="nanob-input-label">Prompt</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="first_frame" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">First Frame</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="middle_frame" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Middle Frame</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="last_frame" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Last Frame</span>
        </div>
      </div>

      <MediaHistory
        nodeId={id}
        history={nodeData.widgetValues?._history || []}
        historyIndex={nodeData.widgetValues?._historyIndex ?? -1}
        fallbackUrl={previewUrl}
        emptyIcon="🎬"
        mediaType="video"
        genTime={nodeData.widgetValues?._genTime}
      />

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        {processing ? (
          <button className="localgen-generate-btn generating" onClick={(e) => {
            e.stopPropagation();
            abortRef.current = true;
            stopAll().catch(() => {});
          }}>Stop</button>
        ) : (
          <button className="localgen-generate-btn" onClick={handleGenerate} disabled={processing} style={{ flex: 1 }}>
            🎬 Generate Video
          </button>
        )}
      </div>

      <div className="ltxvideo-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <TypeBadge color="#e85d75">VID</TypeBadge>
          <span className="nanob-output-label">Video</span>
          <Handle type="source" position={Position.Right} id="output_0" className={`slot-handle ${outHL}`} style={{ color: "#e85d75" }} />
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="type-badge" style={{ color, borderColor: color + "66", backgroundColor: color + "12" }}>{children}</span>;
}

export default memo(LtxFmlNode);
