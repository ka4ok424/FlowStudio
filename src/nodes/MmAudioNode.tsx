import { memo, useCallback, useState, useRef, useMemo, useEffect } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt, getImageUrl, uploadImage, getComfyUrl, stopAll } from "../api/comfyApi";
import { addGenerationToLibrary } from "../store/mediaStore";
import MediaHistory from "./MediaHistory";
import { addToHistory } from "../utils/historyLimit";
import { log } from "../store/logStore";
import { buildMmAudioWorkflow } from "../workflows/mmaudio";

function MmAudioNode({ id, data, selected }: NodeProps) {
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
    return sd.widgetValues?._previewUrl || sd.widgetValues?._preview || null;
  };

  const connectedVideoUrl = useMemo(() => {
    const edge = edgesAll.find((e) => e.target === id && e.targetHandle === "video");
    if (!edge) return null;
    const srcNode = nodesAll.find((n) => n.id === edge.source);
    if (!srcNode) return null;
    const sd = srcNode.data as any;
    return sd.widgetValues?._previewUrl || sd.widgetValues?._preview || null;
  }, [id, edgesAll, nodesAll]);

  // Auto-detect duration + fps from the connected video. Re-runs only when the
  // source URL changes (tracked via _autoSrcUrl) so manual user edits stick
  // until a different video is connected.
  useEffect(() => {
    if (!connectedVideoUrl) return;
    const wv = (useWorkflowStore.getState().nodes.find((n) => n.id === id)?.data as any)?.widgetValues || {};
    if (wv._autoSrcUrl === connectedVideoUrl) return;

    let cancelled = false;
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "auto";
    v.playsInline = true;

    const finish = (duration: number, fps: number) => {
      if (cancelled) return;
      updateWidgetValue(id, "duration", Math.round(duration * 10) / 10);
      updateWidgetValue(id, "fps", fps);
      updateWidgetValue(id, "_autoSrcUrl", connectedVideoUrl);
      try { v.pause(); } catch { /* ignore */ }
      v.removeAttribute("src");
      v.load();
    };

    v.onloadedmetadata = () => {
      if (cancelled) return;
      const duration = v.duration;
      if (!isFinite(duration) || duration <= 0) return;

      if ("requestVideoFrameCallback" in v) {
        const samples: number[] = [];
        let prev = -1;
        const onFrame = (_now: number, meta: any) => {
          if (cancelled) return;
          if (prev >= 0) {
            const dt = meta.mediaTime - prev;
            if (dt > 0) samples.push(dt);
          }
          prev = meta.mediaTime;
          if (samples.length < 5) {
            (v as any).requestVideoFrameCallback(onFrame);
          } else {
            samples.sort((a, b) => a - b);
            const median = samples[Math.floor(samples.length / 2)];
            const fps = median > 0 ? Math.round(1 / median) : 24;
            finish(duration, fps);
          }
        };
        (v as any).requestVideoFrameCallback(onFrame);
        v.play().catch(() => finish(duration, 24));
      } else {
        finish(duration, 24);
      }
    };
    v.onerror = () => { /* leave manual values as-is */ };
    v.src = connectedVideoUrl;

    return () => { cancelled = true; try { v.pause(); } catch { /* ignore */ } v.removeAttribute("src"); v.load(); };
  }, [connectedVideoUrl, id, updateWidgetValue]);

  const handleGenerate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    setError(null);
    abortRef.current = false;
    const startTime = Date.now();

    const wv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const steps = wv.steps || 25;
    const cfg = wv.cfg ?? 4.5;
    const duration = wv.duration ?? 8;
    const fps = wv.fps || 24;
    const maskAwayClip = !!wv.maskAwayClip;
    const seed = wv.seed ? parseInt(wv.seed) : Math.floor(Math.random() * 2147483647);
    const negativePrompt = wv.negativePrompt || "";
    const mmaudioModel = wv.mmaudioModel || "mmaudio_large_44k_v2_fp16.safetensors";
    const vaeModel = wv.vaeModel || "mmaudio_vae_44k_fp16.safetensors";
    const synchformerModel = wv.synchformerModel || "mmaudio_synchformer_fp16.safetensors";
    const clipModel = wv.clipModel || "apple_DFN5B-CLIP-ViT-H-14-384_fp16.safetensors";

    let promptText = "";
    const promptEdge = edgesAll.find((e) => e.target === id && e.targetHandle === "prompt");
    if (promptEdge) {
      const promptNode = nodesAll.find((n) => n.id === promptEdge.source);
      if (promptNode) promptText = (promptNode.data as any).widgetValues?.text || "";
    }
    if (!promptText) { setError("Connect a Prompt node"); setProcessing(false); return; }

    const videoUrl = getConnectedMedia("video");
    if (!videoUrl) { setError("Connect a video to the Video input"); setProcessing(false); return; }

    log("MMAudio rendering", { nodeId: id, nodeType: "fs:mmaudio", nodeLabel: "MMAudio" });

    try {
      // Upload silent video to ComfyUI input folder
      const videoFileName = `fs_mmaudio_in_${id}_${Date.now()}.mp4`;
      let uploadedName: string;
      if (videoUrl.startsWith("data:")) {
        uploadedName = await uploadImage(videoUrl, videoFileName);
      } else {
        const resp = await fetch(videoUrl);
        const blob = await resp.blob();
        const dataUrl = await new Promise<string>((r) => { const rd = new FileReader(); rd.onloadend = () => r(rd.result as string); rd.readAsDataURL(blob); });
        uploadedName = await uploadImage(dataUrl, videoFileName);
      }

      const workflow = buildMmAudioWorkflow({
        prompt: promptText, negativePrompt, seed, steps, cfg, duration, fps,
        videoFileName: uploadedName, maskAwayClip,
        mmaudioModel, vaeModel, synchformerModel, clipModel,
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
                log("MMAudio complete", { nodeId: id, nodeType: "fs:mmaudio", nodeLabel: "MMAudio", status: "success", details: `${duration}s ${steps}st cfg${cfg}` });
                addGenerationToLibrary(apiUrl, {
                  prompt: promptText, model: "MMAudio Large 44k v2", seed: String(seed),
                  steps, cfg, width: 0, height: 0, nodeType: "fs:mmaudio",
                  duration: Date.now() - startTime,
                }, "video");
                setProcessing(false);
                return;
              }
            }
            const st = history[promptId].status;
            if (st?.completed || st?.status_str === "error") {
              const errMsg = history[promptId].status?.messages?.find((m: any) => m[0] === "execution_error");
              setError(errMsg ? errMsg[1]?.exception_message?.slice(0, 120) : "Generation failed");
              log("MMAudio failed", { nodeId: id, nodeType: "fs:mmaudio", nodeLabel: "MMAudio", status: "error" });
              setProcessing(false);
              return;
            }
          }
        } catch { /* keep polling */ }
      }
      setError("Timeout"); setProcessing(false);
    } catch (err: any) {
      setError(err.message);
      log("MMAudio error", { nodeId: id, nodeType: "fs:mmaudio", nodeLabel: "MMAudio", status: "error", details: err.message });
      setProcessing(false);
    }
  }, [id, edgesAll, nodesAll, updateWidgetValue]);

  const vidHL = connectingDir === "source" && (connectingType === "VIDEO" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const promptHL = connectingDir === "source" && (connectingType === "TEXT" || connectingType === "*") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "VIDEO" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(vidHL || promptHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  const wv = nodeData.widgetValues || {};
  const duration = wv.duration ?? 8;

  return (
    <div className={`mmaudio-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="mmaudio-node-inner">
        <div className="mmaudio-accent" />
        <div className="mmaudio-header">
          <span className="mmaudio-icon">🔊</span>
          <div className="mmaudio-header-text">
            <span className="mmaudio-title">MMAudio</span>
            <span className="mmaudio-status">{processing ? "RENDERING..." : `${duration}s · 44kHz`}</span>
          </div>
        </div>
      </div>

      <div className="mmaudio-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="prompt" className={`slot-handle ${promptHL}`} style={{ color: "#f0c040" }} />
          <TypeBadge color="#f0c040">TXT</TypeBadge>
          <span className="nanob-input-label">Prompt (sound desc)</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="video" className={`slot-handle ${vidHL}`} style={{ color: "#e85d75" }} />
          <TypeBadge color="#e85d75">VID</TypeBadge>
          <span className="nanob-input-label">Silent Video</span>
        </div>
      </div>

      <MediaHistory
        nodeId={id}
        history={nodeData.widgetValues?._history || []}
        historyIndex={nodeData.widgetValues?._historyIndex ?? -1}
        fallbackUrl={previewUrl}
        emptyIcon="🔊"
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
          }}>
            Stop
          </button>
        ) : (
          <button className="localgen-generate-btn" onClick={handleGenerate} disabled={processing} style={{ flex: 1 }}>
            🔊 Add Audio
          </button>
        )}
      </div>

      <div className="mmaudio-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <TypeBadge color="#e85d75">VID</TypeBadge>
          <span className="nanob-output-label">Video + Audio</span>
          <Handle type="source" position={Position.Right} id="output_0" className={`slot-handle ${outputHL}`} style={{ color: "#e85d75" }} />
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="type-badge" style={{ color, borderColor: color + "66", backgroundColor: color + "12" }}>{children}</span>;
}

export default memo(MmAudioNode);
