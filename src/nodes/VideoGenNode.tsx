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
  { id: "veo-2.0-generate-001", label: "Veo 2" },
  { id: "veo-3.0-fast-generate-001", label: "Veo 3 Fast" },
  { id: "veo-3.0-generate-001", label: "Veo 3" },
  { id: "veo-3.1-fast-generate-preview", label: "Veo 3.1 Fast" },
  { id: "veo-3.1-lite-generate-preview", label: "Veo 3.1 Lite" },
  { id: "veo-3.1-generate-preview", label: "Veo 3.1" },
];

function VideoGenNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const previewUrl = nodeData.widgetValues?._previewUrl || null;
  const selectedModel = nodeData.widgetValues?.model || VEO_MODELS[0].id;
  const aspectRatio = nodeData.widgetValues?.aspectRatio || "16:9";

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const handleGenerate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Get prompt from connected node
    let promptText = "";
    const promptEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "prompt");
    if (promptEdge) {
      const srcNode = nodesAll.find((n) => n.id === promptEdge.source);
      if (srcNode) promptText = (srcNode.data as any).widgetValues?.text || "";
    }
    // Fallback to manual
    if (!promptText) promptText = nodeData.widgetValues?.prompt || "";

    if (!promptText) {
      setError("Connect a Prompt node or enter text");
      return;
    }

    // Get input image for image-to-video
    let inputImage: string | undefined;
    const imgEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "input_image");
    if (imgEdge) {
      const srcNode = nodesAll.find((n) => n.id === imgEdge.source);
      if (srcNode) {
        const sd = srcNode.data as any;
        const url = sd.widgetValues?._previewUrl || sd.widgetValues?._preview || sd.widgetValues?.portraitUrl;
        if (url) {
          if (url.startsWith("data:")) {
            inputImage = url.replace(/^data:image\/\w+;base64,/, "");
          } else {
            // ComfyUI API URL or blob URL — fetch and convert to base64
            try {
              const resp = await fetch(url);
              const blob = await resp.blob();
              const dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
              inputImage = dataUrl.replace(/^data:image\/\w+;base64,/, "");
            } catch (err) {
              console.warn("[VideoGen] Failed to fetch input image:", err);
            }
          }
        }
      }
    }

    setGenerating(true);
    setError(null);
    setStatus("Starting generation...");
    log("Video generation started", { nodeId: id, nodeType: "fs:videoGen", nodeLabel: "Video Gen" });

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const model = freshWv.model || VEO_MODELS[0].id;
    const ar = freshWv.aspectRatio || "16:9";

    const { operationName, error: startErr } = await startVideoGeneration({
      prompt: promptText,
      model,
      aspectRatio: ar,
      inputImage,
    });

    if (startErr || !operationName) {
      setError(startErr || "Failed to start");
      setGenerating(false);
      setStatus(null);
      return;
    }

    // Poll for result
    setStatus("Generating video...");
    for (let i = 0; i < 300; i++) { // up to 5 min
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
          // Download video from URI and convert to data URL (avoids CORS/auth issues)
          setStatus("Downloading video...");
          try {
            const vRes = await fetch(poll.result.videoUrl);
            const blob = await vRes.blob();
            videoSrc = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          } catch {
            // Fallback: use URL directly
            videoSrc = poll.result.videoUrl;
          }
        }

        if (videoSrc) {
          updateWidgetValue(id, "_previewUrl", videoSrc);
          const prev: string[] = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues?._history || [];
          const { history: newHist, index: newIdx } = addToHistory(prev, videoSrc);
          updateWidgetValue(id, "_history", newHist);
          updateWidgetValue(id, "_historyIndex", newIdx);

          // Save video to IndexedDB + Media Library
          const mediaId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          try {
            await saveImage(`media_${mediaId}`, videoSrc);
            const item: MediaItem = {
              id: mediaId,
              type: "video",
              url: videoSrc,
              fileName: `video_${Date.now()}.mp4`,
              source: "generated",
              favorite: false,
              createdAt: Date.now(),
              genMeta: {
                prompt: promptText,
                model: freshWv.model || VEO_MODELS[0].id,
                seed: "random",
                nodeType: "fs:videoGen",
              },
            };
            useMediaStore.getState().addItem(item);
          } catch (err) {
            console.warn("[VideoGen] Failed to save to library:", err);
          }
        }
        setGenerating(false);
        setStatus(null);
        return;
      }

      if (!poll.done) {
        setStatus(`Generating video... (${i * 2}s)`);
      }
    }

    setError("Timeout (5 min)");
    setGenerating(false);
    setStatus(null);
  }, [id, edgesAll, nodesAll, nodeData.widgetValues, updateWidgetValue]);

  // Highlighting
  const promptHL = connectingDir === "source" && connectingType === "TEXT" ? "highlight" : "";
  const imgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "VIDEO" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(promptHL || imgHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  return (
    <div
      className={`videogen-node ${selected ? "selected" : ""} ${dimClass}`}
      onClick={() => setSelectedNode(id)}
    >
      <div className="videogen-node-inner">
        <div className="videogen-accent" />
        <div className="videogen-header">
          <span className="videogen-icon">🎥</span>
          <div className="videogen-header-text">
            <span className="videogen-title">Video Gen</span>
            <span className="videogen-status">
              {generating ? "GENERATING..." : VEO_MODELS.find(m => m.id === selectedModel)?.label || "Veo"}
            </span>
          </div>
        </div>
      </div>

      {/* Inputs */}
      <div className="videogen-inputs">
        <div className="scene-input-row">
          <Handle type="target" position={Position.Left} id="prompt"
            className={`slot-handle ${promptHL}`} style={{ color: "#f0c040" }} />
          <span className="scene-badge" style={{ color: "#f0c040", borderColor: "#f0c04066", backgroundColor: "#f0c04012" }}>TEXT</span>
          <span className="scene-input-label">Prompt</span>
        </div>
        <div className="scene-input-row">
          <Handle type="target" position={Position.Left} id="input_image"
            className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <span className="scene-badge" style={{ color: "#64b5f6", borderColor: "#64b5f666", backgroundColor: "#64b5f612" }}>IMG</span>
          <span className="scene-input-label">Image (i2v)</span>
        </div>
      </div>

      {/* Preview with history */}
      <MediaHistory
        nodeId={id}
        history={nodeData.widgetValues?._history || []}
        historyIndex={nodeData.widgetValues?._historyIndex ?? -1}
        fallbackUrl={previewUrl}
        emptyIcon="🎥"
        mediaType="video"
      />

      {status && <div className="videogen-status-bar">{status}</div>}
      {error && <div className="nanob-error nodrag">{error}</div>}

      {/* Generate */}
      <div className="nanob-actions">
        <button
          className={`localgen-generate-btn ${generating ? "generating" : ""}`}
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? "Generating..." : "🎥 Generate Video"}
        </button>
      </div>

      {/* Output */}
      <div className="scene-outputs">
        <div className="scene-output-row">
          <span className="scene-badge" style={{ color: "#e85d75", borderColor: "#e85d7566", backgroundColor: "#e85d7512" }}>VID</span>
          <span className="scene-output-label">Video</span>
          <Handle type="source" position={Position.Right} id="output_0"
            className={`slot-handle ${outputHL}`} style={{ color: "#e85d75" }} />
        </div>
      </div>
    </div>
  );
}

export default memo(VideoGenNode);
