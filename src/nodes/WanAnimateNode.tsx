import { memo, useCallback, useState, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt, getImageUrl, uploadImage, getComfyUrl, interruptGeneration } from "../api/comfyApi";
import { addGenerationToLibrary } from "../store/mediaStore";
import MediaHistory from "./MediaHistory";
import { addToHistory } from "../utils/historyLimit";
import { log } from "../store/logStore";
import { buildWanAnimateWorkflow, type WanAnimateMode } from "../workflows/wanAnimate";

function WanAnimateNode({ id, data, selected }: NodeProps) {
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

  const mode: WanAnimateMode = nodeData.widgetValues?.mode || "animate";

  const getConnectedMedia = (handleId: string): string | null => {
    const edge = edgesAll.find((e) => e.target === id && e.targetHandle === handleId);
    if (!edge) return null;
    const srcNode = nodesAll.find((n) => n.id === edge.source);
    if (!srcNode) return null;
    const sd = srcNode.data as any;
    return sd.widgetValues?._previewUrl || sd.widgetValues?._preview || sd.widgetValues?.portraitUrl || null;
  };

  const uploadMedia = async (url: string, name: string): Promise<string> => {
    if (url.startsWith("data:")) return await uploadImage(url, name);
    const resp = await fetch(url);
    const blob = await resp.blob();
    const dataUrl = await new Promise<string>((r) => { const rd = new FileReader(); rd.onloadend = () => r(rd.result as string); rd.readAsDataURL(blob); });
    return await uploadImage(dataUrl, name);
  };

  const handleGenerate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    setError(null);
    abortRef.current = false;
    const startTime = Date.now();

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const currentMode: WanAnimateMode = freshWv.mode || "animate";
    const steps = freshWv.steps || 30;
    const cfg = freshWv.cfg ?? 6.0;
    const shift = freshWv.shift ?? 5.0;
    const width = freshWv.width || 832;
    const height = freshWv.height || 480;
    const numFrames = freshWv.numFrames || 81;
    const fps = freshWv.fps || 16;
    const poseStrength = freshWv.poseStrength ?? 1.0;
    const faceStrength = freshWv.faceStrength ?? 1.0;
    const seed = freshWv.seed ? parseInt(freshWv.seed) : Math.floor(Math.random() * 2147483647);

    // Get prompt
    let promptText = "";
    const promptEdge = edgesAll.find((e) => e.target === id && e.targetHandle === "prompt");
    if (promptEdge) {
      const promptNode = nodesAll.find((n) => n.id === promptEdge.source);
      if (promptNode) promptText = (promptNode.data as any).widgetValues?.text || "";
    }
    if (!promptText) { setError("Connect a Prompt node"); setProcessing(false); return; }

    // Reference image is required
    const refImageUrl = getConnectedMedia("ref_image");
    if (!refImageUrl) { setError("Connect a reference image"); setProcessing(false); return; }

    // Driving video is required
    const drivingHandle = currentMode === "animate" ? "pose_video" : "face_video";
    const drivingUrl = getConnectedMedia(drivingHandle);
    if (!drivingUrl) {
      setError(currentMode === "animate" ? "Connect a pose/motion video" : "Connect a face video");
      setProcessing(false);
      return;
    }

    try {
      const refImageName = await uploadMedia(refImageUrl, `fs_anim_ref_${id}.png`);
      const ext = drivingUrl.includes("video/mp4") || drivingUrl.includes(".mp4") ? "mp4" : "png";
      const drivingName = await uploadMedia(drivingUrl, `fs_anim_drive_${id}.${ext}`);

      const workflow = buildWanAnimateWorkflow({
        mode: currentMode,
        prompt: promptText,
        negativePrompt: freshWv.negativePrompt || "",
        seed, steps, cfg, shift, width, height, numFrames, fps,
        refImageName,
        poseVideoName: currentMode === "animate" ? drivingName : null,
        faceVideoName: currentMode === "replace" ? drivingName : null,
        poseStrength, faceStrength,
      });

      log("Wan Animate rendering", { nodeId: id, nodeType: "fs:wanAnimate", nodeLabel: "Wan Animate", details: currentMode });
      const result = await queuePrompt(workflow);
      const promptId = result.prompt_id;

      // Poll for result — video takes longer
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
                log("Wan Animate complete", { nodeId: id, nodeType: "fs:wanAnimate", nodeLabel: "Wan Animate", status: "success" });
                addGenerationToLibrary(apiUrl, {
                  prompt: promptText, model: "Wan2.2-Animate-14B", seed: String(seed),
                  steps, cfg, width, height, nodeType: "fs:wanAnimate", duration: Date.now() - startTime,
                }, "video");
                setProcessing(false);
                return;
              }
            }
            const st = history[promptId].status;
            if (st?.completed || st?.status_str === "error") {
              const errMsg = history[promptId].status?.messages?.find((m: any) => m[0] === "execution_error");
              setError(errMsg ? errMsg[1]?.exception_message?.slice(0, 120) : "Generation failed");
              setProcessing(false);
              return;
            }
          }
        } catch { /* keep polling */ }
      }
      setError("Timeout"); setProcessing(false);
    } catch (err: any) {
      setError(err.message);
      log("Wan Animate error", { nodeId: id, nodeType: "fs:wanAnimate", nodeLabel: "Wan Animate", status: "error", details: err.message });
      setProcessing(false);
    }
  }, [id, edgesAll, nodesAll, updateWidgetValue]);

  const imgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const vidHL = connectingDir === "source" && (connectingType === "VIDEO" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const promptHL = connectingDir === "source" && (connectingType === "TEXT" || connectingType === "*") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "VIDEO" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(imgHL || vidHL || promptHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  const freshWv = nodeData.widgetValues || {};
  const numFrames = freshWv.numFrames || 81;
  const fps = freshWv.fps || 16;
  const duration = (numFrames / fps).toFixed(1);

  return (
    <div className={`wananimate-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="wananimate-node-inner">
        <div className="wananimate-accent" />
        <div className="wananimate-header">
          <span className="wananimate-icon">🕺</span>
          <div className="wananimate-header-text">
            <span className="wananimate-title">Wan Animate</span>
            <span className="wananimate-status">{processing ? "RENDERING..." : `Wan 2.2 Animate · ${mode}`}</span>
          </div>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="wananimate-mode nodrag" onClick={(e) => e.stopPropagation()}>
        <button
          className={`wananimate-mode-btn ${mode === "animate" ? "active" : ""}`}
          onClick={() => updateWidgetValue(id, "mode", "animate")}
        >
          Motion
        </button>
        <button
          className={`wananimate-mode-btn ${mode === "replace" ? "active" : ""}`}
          onClick={() => updateWidgetValue(id, "mode", "replace")}
        >
          Replace
        </button>
      </div>

      <div className="wananimate-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="prompt" className={`slot-handle ${promptHL}`} style={{ color: "#f0c040" }} />
          <TypeBadge color="#f0c040">TXT</TypeBadge>
          <span className="nanob-input-label">Prompt</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="ref_image" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Character Image</span>
        </div>
        {mode === "animate" ? (
          <div className="nanob-input-row">
            <Handle type="target" position={Position.Left} id="pose_video" className={`slot-handle ${vidHL}`} style={{ color: "#e85d75" }} />
            <TypeBadge color="#e85d75">VID</TypeBadge>
            <span className="nanob-input-label">Motion Video</span>
          </div>
        ) : (
          <div className="nanob-input-row">
            <Handle type="target" position={Position.Left} id="face_video" className={`slot-handle ${vidHL}`} style={{ color: "#e85d75" }} />
            <TypeBadge color="#e85d75">VID</TypeBadge>
            <span className="nanob-input-label">Face Video</span>
          </div>
        )}
      </div>

      <MediaHistory
        nodeId={id}
        history={nodeData.widgetValues?._history || []}
        historyIndex={nodeData.widgetValues?._historyIndex ?? -1}
        fallbackUrl={previewUrl}
        emptyIcon="🕺"
        mediaType="video"
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
          <button className="localgen-generate-btn" onClick={handleGenerate} disabled={processing} style={{ flex: 1 }}>
            {mode === "animate" ? "🕺 Animate" : "🔄 Replace"}
          </button>
        )}
      </div>

      <div className="wananimate-outputs">
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

export default memo(WanAnimateNode);
