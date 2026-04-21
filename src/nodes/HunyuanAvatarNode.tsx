import { memo, useCallback, useState, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt, getImageUrl, uploadImage, getComfyUrl, interruptGeneration } from "../api/comfyApi";
import { addGenerationToLibrary } from "../store/mediaStore";
import MediaHistory from "./MediaHistory";
import { addToHistory } from "../utils/historyLimit";
import { log } from "../store/logStore";
import { buildHunyuanAvatarWorkflow } from "../workflows/hunyuanAvatar";

function HunyuanAvatarNode({ id, data, selected }: NodeProps) {
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
    const steps = freshWv.steps || 25;
    const cfg = freshWv.cfg ?? 7.5;
    const width = freshWv.width || 512;
    const height = freshWv.height || 512;
    const videoLength = freshWv.videoLength || 128;
    const fps = freshWv.fps || 25.0;
    const duration = freshWv.duration || 5.0;
    const faceSize = freshWv.faceSize ?? 3.0;
    const imageSize = freshWv.imageSize || 704;
    const objectName = freshWv.objectName || "person";
    const seed = freshWv.seed ? parseInt(freshWv.seed) : Math.floor(Math.random() * 2147483647);

    // Get prompt
    let promptText = freshWv.prompt || "";
    const promptEdge = edgesAll.find((e) => e.target === id && e.targetHandle === "prompt");
    if (promptEdge) {
      const promptNode = nodesAll.find((n) => n.id === promptEdge.source);
      if (promptNode) promptText = (promptNode.data as any).widgetValues?.text || promptText;
    }
    if (!promptText) promptText = "A person talking naturally";

    // Image required
    const imageUrl = getConnectedMedia("image");
    if (!imageUrl) { setError("Connect a portrait image"); setProcessing(false); return; }

    // Audio required
    const audioUrl = getConnectedMedia("audio");
    if (!audioUrl) { setError("Connect an audio source"); setProcessing(false); return; }

    try {
      // Upload image
      let imageName: string;
      if (imageUrl.startsWith("data:")) {
        imageName = await uploadImage(imageUrl, `fs_avatar_img_${id}.png`);
      } else {
        const resp = await fetch(imageUrl);
        const blob = await resp.blob();
        const dataUrl = await new Promise<string>((r) => { const rd = new FileReader(); rd.onloadend = () => r(rd.result as string); rd.readAsDataURL(blob); });
        imageName = await uploadImage(dataUrl, `fs_avatar_img_${id}.png`);
      }

      // Upload audio
      let audioName: string;
      if (audioUrl.startsWith("data:")) {
        audioName = await uploadImage(audioUrl, `fs_avatar_audio_${id}.wav`);
      } else {
        const resp = await fetch(audioUrl);
        const blob = await resp.blob();
        const dataUrl = await new Promise<string>((r) => { const rd = new FileReader(); rd.onloadend = () => r(rd.result as string); rd.readAsDataURL(blob); });
        audioName = await uploadImage(dataUrl, `fs_avatar_audio_${id}.wav`);
      }

      const workflow = buildHunyuanAvatarWorkflow({
        prompt: promptText,
        negativePrompt: freshWv.negativePrompt || "low quality, deformation, bad hands, bad teeth, bad eyes, distortion, blurring",
        seed, steps, cfg, width, height, videoLength, fps, duration,
        faceSize, imageSize, objectName,
        imageName, audioName,
        transformerModel: "ckpts/hunyuan-video-t2v-720p/transformers/mp_rank_00_model_states_fp8.pt",
      });

      log("HunyuanAvatar rendering", { nodeId: id, nodeType: "fs:hunyuanAvatar", nodeLabel: "HunyuanAvatar" });
      const result = await queuePrompt(workflow);
      const promptId = result.prompt_id;

      for (let attempt = 0; attempt < 900; attempt++) {
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
                log("HunyuanAvatar complete", { nodeId: id, nodeType: "fs:hunyuanAvatar", nodeLabel: "HunyuanAvatar", status: "success" });
                addGenerationToLibrary(apiUrl, {
                  prompt: promptText, model: "HunyuanVideo-Avatar", seed: String(seed),
                  steps, cfg, width, height, nodeType: "fs:hunyuanAvatar", duration: Date.now() - startTime,
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
      log("HunyuanAvatar error", { nodeId: id, nodeType: "fs:hunyuanAvatar", nodeLabel: "HunyuanAvatar", status: "error", details: err.message });
      setProcessing(false);
    }
  }, [id, edgesAll, nodesAll, updateWidgetValue]);

  const imgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const audioHL = connectingDir === "source" && (connectingType === "AUDIO" || connectingType === "*") ? "highlight" : "";
  const promptHL = connectingDir === "source" && (connectingType === "TEXT" || connectingType === "*") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "VIDEO" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(imgHL || audioHL || promptHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  return (
    <div className={`hunyuanavatar-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="hunyuanavatar-node-inner">
        <div className="hunyuanavatar-accent" />
        <div className="hunyuanavatar-header">
          <span className="hunyuanavatar-icon">🗣</span>
          <div className="hunyuanavatar-header-text">
            <span className="hunyuanavatar-title">HunyuanAvatar</span>
            <span className="hunyuanavatar-status">{processing ? "RENDERING..." : "HunyuanAvatar"}</span>
          </div>
        </div>
      </div>

      <div className="hunyuanavatar-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="prompt" className={`slot-handle ${promptHL}`} style={{ color: "#f0c040" }} />
          <TypeBadge color="#f0c040">TXT</TypeBadge>
          <span className="nanob-input-label">Prompt</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="image" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Portrait</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="audio" className={`slot-handle ${audioHL}`} style={{ color: "#e8a040" }} />
          <TypeBadge color="#e8a040">AUD</TypeBadge>
          <span className="nanob-input-label">Audio / Speech</span>
        </div>
      </div>

      <MediaHistory
        nodeId={id}
        history={nodeData.widgetValues?._history || []}
        historyIndex={nodeData.widgetValues?._historyIndex ?? -1}
        fallbackUrl={previewUrl}
        emptyIcon="🗣"
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
            🗣 Generate Avatar
          </button>
        )}
      </div>

      <div className="hunyuanavatar-outputs">
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

export default memo(HunyuanAvatarNode);
