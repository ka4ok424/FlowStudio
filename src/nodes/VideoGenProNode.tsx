import { memo, useCallback, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { startVideoGeneration, pollOperation } from "../api/googleMediaApi";
import { useMediaStore, type MediaItem } from "../store/mediaStore";
import { saveImage } from "../store/imageDb";
import MediaHistory from "./MediaHistory";
import { addToHistory } from "../utils/historyLimit";
import { log } from "../store/logStore";

const VEO_MODELS = [
  { id: "veo-3.1-lite-generate-preview", label: "Veo 3.1 Lite" },
  { id: "veo-3.1-fast-generate-preview", label: "Veo 3.1 Fast" },
  { id: "veo-3.1-generate-preview", label: "Veo 3.1" },
  { id: "veo-3.0-fast-generate-001", label: "Veo 3 Fast" },
  { id: "veo-3.0-generate-001", label: "Veo 3" },
  { id: "veo-2.0-generate-001", label: "Veo 2" },
];

// Helper: get image base64 from connected node
async function getImageFromNode(nodesAll: any[], edgesAll: any[], nodeId: string, handleId: string): Promise<string | undefined> {
  const edge = edgesAll.find((e: any) => e.target === nodeId && e.targetHandle === handleId);
  if (!edge) return undefined;
  const srcNode = nodesAll.find((n: any) => n.id === edge.source);
  if (!srcNode) return undefined;
  const sd = srcNode.data as any;
  const url = sd.widgetValues?._previewUrl || sd.widgetValues?._preview || sd.widgetValues?.portraitUrl;
  if (!url) return undefined;
  if (url.startsWith("data:")) return url.replace(/^data:image\/\w+;base64,/, "");
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const dataUrl = await new Promise<string>((r) => { const rd = new FileReader(); rd.onloadend = () => r(rd.result as string); rd.readAsDataURL(blob); });
    return dataUrl.replace(/^data:image\/\w+;base64,/, "");
  } catch { return undefined; }
}

function VideoGenProNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const previewUrl = nodeData.widgetValues?._previewUrl || null;
  const refCount = nodeData.widgetValues?._refCount || 1;

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const addRef = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (refCount < 3) updateWidgetValue(id, "_refCount", refCount + 1);
  }, [id, refCount, updateWidgetValue]);

  const removeRef = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (refCount > 1) updateWidgetValue(id, "_refCount", refCount - 1);
  }, [id, refCount, updateWidgetValue]);

  const handleGenerate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Get prompt
    let promptText = "";
    const promptEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "prompt");
    if (promptEdge) {
      const srcNode = nodesAll.find((n) => n.id === promptEdge.source);
      if (srcNode) promptText = (srcNode.data as any).widgetValues?.text || "";
    }
    if (!promptText) {
      setError("Connect a Prompt node");
      return;
    }

    setGenerating(true);
    setError(null);
    setStatus("Starting...");
    log("Video Pro generation started", { nodeId: id, nodeType: "fs:videoGenPro", nodeLabel: "Video Gen Pro" });

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const model = freshWv.model || VEO_MODELS[0].id;
    const ar = freshWv.aspectRatio || "16:9";

    // Get images from connected nodes
    const inputImage = await getImageFromNode(nodesAll as any[], edgesAll as any[], id, "first_frame");
    const lastFrame = await getImageFromNode(nodesAll as any[], edgesAll as any[], id, "last_frame");

    // Get reference images (Veo 3.1 only, up to 3)
    const referenceImages: Array<{ image: { bytesBase64Encoded: string }; referenceType: string }> = [];
    for (let i = 0; i < refCount; i++) {
      const refImg = await getImageFromNode(nodesAll as any[], edgesAll as any[], id, `ref_${i}`);
      if (refImg) {
        referenceImages.push({ image: { bytesBase64Encoded: refImg }, referenceType: "asset" });
      }
    }

    // Build request
    const { operationName, error: startErr } = await startVideoGeneration({
      prompt: promptText,
      model,
      aspectRatio: ar,
      inputImage,
      // Extended params
      lastFrame,
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      negativePrompt: freshWv.negativePrompt || undefined,
      durationSeconds: freshWv.duration ? parseInt(freshWv.duration) : undefined,
      resolution: freshWv.resolution || undefined,
      seed: freshWv.seed ? parseInt(freshWv.seed) : undefined,
      numberOfVideos: freshWv.numberOfVideos || undefined,
    });

    if (startErr || !operationName) {
      setError(startErr || "Failed to start");
      setGenerating(false);
      setStatus(null);
      return;
    }

    setStatus("Generating video...");
    for (let i = 0; i < 300; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await pollOperation(operationName);

      if (poll.error) {
        setError(poll.error);
        setGenerating(false);
        setStatus(null);
        return;
      }

      if (poll.done && poll.result) {
        let videoSrc: string | null = null;

        if (poll.result.videoBase64) {
          videoSrc = `data:video/mp4;base64,${poll.result.videoBase64}`;
        } else if (poll.result.videoUrl) {
          setStatus("Downloading...");
          try {
            const vRes = await fetch(poll.result.videoUrl);
            const blob = await vRes.blob();
            videoSrc = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          } catch {
            videoSrc = poll.result.videoUrl;
          }
        }

        if (videoSrc) {
          updateWidgetValue(id, "_previewUrl", videoSrc);
          const prev: string[] = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues?._history || [];
          const { history: newHist, index: newIdx } = addToHistory(prev, videoSrc);
          updateWidgetValue(id, "_history", newHist);
          updateWidgetValue(id, "_historyIndex", newIdx);

          // Save to media library
          const mediaId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          try {
            await saveImage(`media_${mediaId}`, videoSrc);
            const item: MediaItem = {
              id: mediaId, type: "video", url: `__idb_media__:${mediaId}`,
              fileName: `video_${model}_${Date.now()}.mp4`, source: "generated",
              favorite: false, createdAt: Date.now(),
              genMeta: { prompt: promptText, model, seed: String(freshWv.seed || "random"), nodeType: "fs:videoGenPro" },
            };
            useMediaStore.getState().addItem(item);
          } catch { /* ignore */ }
        }
        setGenerating(false);
        setStatus(null);
        return;
      }

      if (!poll.done) {
        setStatus(`Generating... (${i * 2}s)`);
      }
    }

    setError("Timeout (5 min)");
    setGenerating(false);
    setStatus(null);
  }, [id, edgesAll, nodesAll, nodeData.widgetValues, refCount, updateWidgetValue]);

  // Highlighting
  const promptHL = connectingDir === "source" && connectingType === "TEXT" ? "highlight" : "";
  const imgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "VIDEO" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(promptHL || imgHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  const selectedModel = nodeData.widgetValues?.model || VEO_MODELS[0].id;

  return (
    <div
      className={`videogen-node ${selected ? "selected" : ""} ${dimClass}`}
      onClick={() => setSelectedNode(id)}
    >
      <div className="videogen-node-inner">
        <div className="videogen-accent" />
        <div className="videogen-header">
          <span className="videogen-icon">🎬</span>
          <div className="videogen-header-text">
            <span className="videogen-title">Video Gen Pro</span>
            <span className="videogen-status">
              {generating ? "GENERATING..." : VEO_MODELS.find(m => m.id === selectedModel)?.label || "Veo"}
            </span>
          </div>
        </div>
      </div>

      {/* Inputs */}
      <div className="videogen-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="prompt"
            className={`slot-handle ${promptHL}`} style={{ color: "#f0c040" }} />
          <TypeBadge color="#f0c040">TEXT</TypeBadge>
          <span className="nanob-input-label">Prompt</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="first_frame"
            className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">First Frame</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="last_frame"
            className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Last Frame</span>
        </div>

        {/* Dynamic reference image slots (Veo 3.1) */}
        {Array.from({ length: refCount }, (_, i) => (
          <div key={`ref_${i}`} className="nanob-input-row">
            <Handle type="target" position={Position.Left} id={`ref_${i}`}
              className={`slot-handle ${imgHL}`} style={{ color: "#a78bfa" }} />
            <TypeBadge color="#a78bfa">REF</TypeBadge>
            <span className="nanob-input-label">Ref {i + 1}</span>
          </div>
        ))}

        <div className="scene-char-controls" style={{ paddingLeft: 14 }}>
          {refCount < 3 && (
            <button className="scene-char-btn" onClick={addRef} title="Add reference">+</button>
          )}
          {refCount > 1 && (
            <button className="scene-char-btn scene-char-remove" onClick={removeRef} title="Remove reference">−</button>
          )}
          <span className="scene-char-count">{refCount}/3</span>
        </div>
      </div>

      {/* Preview with history */}
      <MediaHistory
        nodeId={id}
        history={nodeData.widgetValues?._history || []}
        historyIndex={nodeData.widgetValues?._historyIndex ?? -1}
        fallbackUrl={previewUrl}
        emptyIcon="🎬"
        mediaType="video"
      />

      {status && <div className="videogen-status-bar">{status}</div>}
      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button
          className={`localgen-generate-btn ${generating ? "generating" : ""}`}
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? "Generating..." : "🎬 Generate Video"}
        </button>
        <button className="nanob-dice-btn" onClick={(e) => {
          e.stopPropagation();
          updateWidgetValue(id, "seed", Math.floor(Math.random() * 4294967295).toString());
        }} title="Random seed">🎲</button>
      </div>

      <div className="scene-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <TypeBadge color="#e85d75">VID</TypeBadge>
          <span className="nanob-output-label">Video</span>
          <Handle type="source" position={Position.Right} id="output_0"
            className={`slot-handle ${outputHL}`} style={{ color: "#e85d75" }} />
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="type-badge" style={{
      color, borderColor: color + "66", backgroundColor: color + "12",
    }}>{children}</span>
  );
}

export default memo(VideoGenProNode);
