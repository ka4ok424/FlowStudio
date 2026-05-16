import { memo, useCallback, useState, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt, getImageUrl, uploadImage, getComfyUrl, stopAll } from "../api/comfyApi";
import { addGenerationToLibrary } from "../store/mediaStore";
import MediaHistory from "./MediaHistory";
import { addToHistory } from "../utils/historyLimit";
import { log } from "../store/logStore";
import { buildLtxLoraWorkflow } from "../workflows/ltxLora";

const DEFAULT_LORA = "LTX/LTX-2/IC-Lora/ltx-2.3-22b-distilled-1.1_lora-dynamic_fro09_avg_rank_111_bf16.safetensors";

/** 0.5 s of 16 kHz mono silent PCM. Used as a LoadAudio placeholder when the
 *  user hasn't connected an audio input. ComfyUI validates LoadAudio's `audio`
 *  combo against files actually present in `input/` — without a real
 *  filename the whole prompt fails with `value_not_in_list`, even though
 *  ComfySwitch routes the audio chain away. */
function makeSilentWavDataUrl(): string {
  const sampleRate = 16000;
  const durSec = 0.5;
  const numSamples = Math.floor(durSec * sampleRate);
  const buf = new ArrayBuffer(44 + numSamples * 2);
  const v = new DataView(buf);
  // RIFF
  v.setUint32(0, 0x52494646, false);                 // "RIFF"
  v.setUint32(4, 36 + numSamples * 2, true);
  v.setUint32(8, 0x57415645, false);                 // "WAVE"
  // fmt
  v.setUint32(12, 0x666d7420, false);                // "fmt "
  v.setUint32(16, 16, true);                         // chunk size
  v.setUint16(20, 1, true);                          // PCM
  v.setUint16(22, 1, true);                          // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);             // byte rate
  v.setUint16(32, 2, true);                          // block align
  v.setUint16(34, 16, true);                         // bits per sample
  // data
  v.setUint32(36, 0x64617461, false);                // "data"
  v.setUint32(40, numSamples * 2, true);
  // Samples remain zero — pure silence.
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return "data:audio/wav;base64," + btoa(binary);
}

function LtxLoraNode({ id, data, selected }: NodeProps) {
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
    return sd.widgetValues?._previewUrl || sd.widgetValues?._preview || sd.widgetValues?.portraitUrl || sd.widgetValues?._audioUrl || null;
  };

  const audioConnected = !!edgesAll.find((e) => e.target === id && e.targetHandle === "audio");

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
    const firstFrameStrength = freshWv.firstFrameStrength ?? 0.5;
    const lastFrameStrength = freshWv.lastFrameStrength ?? 1.0;
    const loraOn = !!freshWv.loraOn;
    const loraStrength = freshWv.loraStrength ?? 0.3;
    const promptEnhancer = freshWv.promptEnhancer ?? true;
    const useVocalsOnly = !!freshWv.useVocalsOnly;
    const trimStart = freshWv.trimStart ?? 0;
    const trimDuration = freshWv.trimDuration ?? 0;

    // Connected upstream media
    let promptText = "";
    const promptEdge = edgesAll.find((ed) => ed.target === id && ed.targetHandle === "prompt");
    if (promptEdge) {
      const srcNode = nodesAll.find((n) => n.id === promptEdge.source);
      if (srcNode) promptText = (srcNode.data as any).widgetValues?.text || "";
    }
    if (!promptText) { setError("Connect a Prompt node"); setProcessing(false); return; }

    const firstFrameUrl = getConnectedMedia("first_frame");
    const lastFrameUrl  = getConnectedMedia("last_frame");
    if (!firstFrameUrl) { setError("Connect FIRST FRAME (IMAGE)"); setProcessing(false); return; }
    if (!lastFrameUrl)  { setError("Connect LAST FRAME (IMAGE)");  setProcessing(false); return; }

    const audioUrl = audioConnected ? getConnectedMedia("audio") : null;

    log("LTX Lora rendering", { nodeId: id, nodeType: "fs:ltxLora", nodeLabel: "LTX 2.3 TS Lora" });

    try {
      // --- Upload frames to ComfyUI input/ ---
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
      const firstName = await uploadImage(await fetchToDataUrl(firstFrameUrl), `fs_ltxlora_ff_${id}_${ts}.png`);
      const lastName  = await uploadImage(await fetchToDataUrl(lastFrameUrl),  `fs_ltxlora_lf_${id}_${ts}.png`);

      // ALWAYS upload a real audio file because ComfyUI validates LoadAudio's
      // combo against actual files in input/ — even when ComfySwitch routes
      // the audio chain away. When no audio is connected we substitute a
      // tiny silent WAV; the switch still selects LTX-generated audio.
      let audioName: string;
      let audioWasProvided = false;
      if (audioUrl) {
        const ext = (() => {
          if (audioUrl.startsWith("data:audio/wav")) return "wav";
          if (audioUrl.startsWith("data:audio/mp3") || audioUrl.startsWith("data:audio/mpeg")) return "mp3";
          if (audioUrl.startsWith("data:audio/flac")) return "flac";
          const m = audioUrl.match(/\.([a-zA-Z0-9]{3,4})(?:\?|&|$)/);
          return m ? m[1].toLowerCase() : "wav";
        })();
        const audioDataUrl = await fetchToDataUrl(audioUrl);
        audioName = await uploadImage(audioDataUrl, `fs_ltxlora_aud_${id}_${ts}.${ext}`);
        audioWasProvided = true;
      } else {
        audioName = await uploadImage(makeSilentWavDataUrl(), "fs_ltxlora_silent.wav");
      }

      const workflow = buildLtxLoraWorkflow({
        prompt: promptText,
        width, height, fps, frames,
        cfg, steps, seed,
        firstFrameStrength, lastFrameStrength,
        loraOn,
        loraName: DEFAULT_LORA,
        loraStrength,
        promptEnhancer,
        firstFrameFile: firstName,
        lastFrameFile: lastName,
        audioFile: audioName,
        audioWasProvided,
        useVocalsOnly,
        trimStart, trimDuration,
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
                log("LTX Lora complete", { nodeId: id, nodeType: "fs:ltxLora", nodeLabel: "LTX 2.3 TS Lora", status: "success", details: `${frames}f ${width}x${height} cfg${cfg}` });
                addGenerationToLibrary(apiUrl, {
                  prompt: promptText, model: "LTX 2.3 22B FLF2V + LoRA", seed: String(seed),
                  steps, cfg, width, height, nodeType: "fs:ltxLora",
                  duration: Date.now() - startTime,
                }, "video");
                setProcessing(false);
                return;
              }
            }
            const st = history[promptId].status;
            if (st?.completed || st?.status_str === "error") {
              const errMsg = history[promptId].status?.messages?.find((m: any) => m[0] === "execution_error");
              // eslint-disable-next-line no-console
              console.warn("[LTX Lora] generation finished with no output. history entry:", history[promptId]);
              setError(errMsg ? errMsg[1]?.exception_message?.slice(0, 200) : "Generation failed — see console for ComfyUI history");
              log("LTX Lora failed", { nodeId: id, nodeType: "fs:ltxLora", nodeLabel: "LTX 2.3 TS Lora", status: "error" });
              setProcessing(false);
              return;
            }
          }
        } catch { /* keep polling */ }
      }
      setError("Timeout"); setProcessing(false);
    } catch (err: any) {
      setError(err.message);
      log("LTX Lora error", { nodeId: id, nodeType: "fs:ltxLora", nodeLabel: "LTX 2.3 TS Lora", status: "error", details: err.message });
      setProcessing(false);
    }
  }, [id, edgesAll, nodesAll, audioConnected, updateWidgetValue]);

  const txtHL  = connectingDir === "source" && (connectingType === "TEXT" || connectingType === "*") ? "highlight" : "";
  const imgHL  = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const audHL  = connectingDir === "source" && (connectingType === "AUDIO" || connectingType === "*") ? "highlight" : "";
  const outHL  = connectingDir === "target" && (connectingType === "VIDEO" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const hasCompat = connectingType ? !!(txtHL || imgHL || audHL || outHL) : false;
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
            <span className="ltxvideo-title">LTX 2.3 TS Lora</span>
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
          <Handle type="target" position={Position.Left} id="last_frame" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Last Frame</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="audio" className={`slot-handle ${audHL}`} style={{ color: "#ec4899" }} />
          <TypeBadge color="#ec4899">AUD</TypeBadge>
          <span className="nanob-input-label">Audio (optional)</span>
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
            🎬 Render Transition
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

export default memo(LtxLoraNode);
