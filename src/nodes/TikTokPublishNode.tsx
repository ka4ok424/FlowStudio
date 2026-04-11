import { memo, useCallback, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { startTikTokAuth, isTokenValid, publishVideoByUrl, checkPublishStatus } from "../api/tiktokApi";
import { useMediaStore } from "../store/mediaStore";
import { log } from "../store/logStore";

const PRIVACY_OPTIONS = [
  { id: "PUBLIC_TO_EVERYONE", label: "Public" },
  { id: "FOLLOWER_OF_CREATOR", label: "Followers" },
  { id: "MUTUAL_FOLLOW_FRIENDS", label: "Friends" },
  { id: "SELF_ONLY", label: "Private" },
];

function TikTokPublishNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const title = nodeData.widgetValues?.title || "";
  const privacy = nodeData.widgetValues?.privacy || "SELF_ONLY";
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(isTokenValid());

  const handleConnect = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    startTikTokAuth();
    // Check after a delay
    setTimeout(() => setConnected(isTokenValid()), 5000);
    setTimeout(() => setConnected(isTokenValid()), 10000);
  }, []);

  const handlePublish = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!connected) {
      setError("Connect TikTok first");
      return;
    }

    // Get video from connected node
    const videoEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "video");
    if (!videoEdge) {
      setError("Connect a Video Gen node");
      return;
    }
    const srcNode = nodesAll.find((n) => n.id === videoEdge.source);
    if (!srcNode) {
      setError("Source node not found");
      return;
    }
    const srcData = srcNode.data as any;
    const videoUrl = srcData.widgetValues?._previewUrl || srcData.widgetValues?._preview;
    if (!videoUrl) {
      setError("No video in connected node. Generate or import first.");
      return;
    }

    // Get title from connected prompt or manual input
    let publishTitle = title;
    const titleEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "caption");
    if (titleEdge) {
      const titleNode = nodesAll.find((n) => n.id === titleEdge.source);
      if (titleNode) publishTitle = (titleNode.data as any).widgetValues?.text || publishTitle;
    }

    if (!publishTitle) {
      setError("Add a caption (connect Prompt or type in Inspector)");
      return;
    }

    setPublishing(true);
    setError(null);
    setStatus("Publishing to TikTok...");
    log("Publishing to TikTok", { nodeId: id, nodeType: "fs:tiktokPublish", nodeLabel: "TikTok", details: publishTitle.slice(0, 60) });

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const isAiGenerated = freshWv.aiGenerated !== false; // default true

    let result;
    if (videoUrl.startsWith("data:")) {
      // Direct upload via TikTok file upload API
      setStatus("Uploading video to TikTok...");
      const { uploadVideoFile } = await import("../api/tiktokApi");
      result = await uploadVideoFile({
        videoDataUrl: videoUrl,
        title: publishTitle,
        privacy: (freshWv.privacy || privacy) as any,
        disableComment: freshWv.disableComment || false,
        disableDuet: freshWv.disableDuet || false,
        disableStitch: freshWv.disableStitch || false,
        isAiGenerated,
      });
    } else {
      result = await publishVideoByUrl({
        videoUrl,
        title: publishTitle,
        privacy: (freshWv.privacy || privacy) as any,
        disableComment: freshWv.disableComment || false,
        disableDuet: freshWv.disableDuet || false,
        disableStitch: freshWv.disableStitch || false,
        brandContent: false,
        isAiGenerated,
      });
    }

    if (result.error) {
      setError(result.error);
      setPublishing(false);
      setStatus(null);
      return;
    }

    // Poll publish status
    if (result.publishId) {
      setStatus("Processing...");
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const check = await checkPublishStatus(result.publishId!);

        if (check.status === "PUBLISH_COMPLETE" || check.status === "SEND_TO_USER_INBOX") {
          const msg = check.status === "SEND_TO_USER_INBOX" ? "Sent to Drafts" : "Published";
          const freshWv2 = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
          const entry = {
            status: "success",
            message: msg,
            caption: publishTitle.slice(0, 50),
            privacy: freshWv2.privacy || privacy,
            sourceNode: srcNode?.data?.type || "unknown",
            time: Date.now(),
          };
          const prevHist = freshWv2._publishHistory || [];
          const hist = [...prevHist, entry].slice(-50);
          updateWidgetValue(id, "_publishHistory", hist);
          updateWidgetValue(id, "_lastPublish", entry);
          log(msg, { nodeId: id, nodeType: "fs:tiktokPublish", nodeLabel: "TikTok", status: "success", details: publishTitle.slice(0, 60) });

          // Save publishId to MediaItem for analytics tracking
          const mediaItems = useMediaStore.getState().items;
          // Find the most recent video from source node
          const sourceType = srcNode?.data?.type;
          const recentVideo = mediaItems.find((m) =>
            m.type === "video" && m.genMeta?.nodeType === sourceType
          );
          if (recentVideo) {
            const publishEntry = {
              platform: "tiktok" as const,
              publishId: result.publishId!,
              publishedAt: Date.now(),
              caption: publishTitle.slice(0, 200),
              privacy: (freshWv2.privacy || privacy) as string,
              status: (check.status === "PUBLISH_COMPLETE" ? "published" : "sent") as "published" | "sent",
            };
            const existingMeta = recentVideo.publishMeta || [];
            const updatedItems = mediaItems.map((m) =>
              m.id === recentVideo.id
                ? { ...m, publishMeta: [...existingMeta, publishEntry] }
                : m
            );
            useMediaStore.setState({ items: updatedItems });
            useMediaStore.getState().saveToStorage();
          }

          setStatus(null);
          setPublishing(false);
          return;
        }
        if (check.status === "FAILED") {
          const freshWv2 = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
          const entry = {
            status: "failed",
            message: check.error || "Failed",
            caption: publishTitle.slice(0, 50),
            privacy: freshWv2.privacy || privacy,
            sourceNode: srcNode?.data?.type || "unknown",
            time: Date.now(),
          };
          const prevHist = freshWv2._publishHistory || [];
          const hist = [...prevHist, entry].slice(-50);
          updateWidgetValue(id, "_publishHistory", hist);
          updateWidgetValue(id, "_lastPublish", entry);
          log("Publish failed", { nodeId: id, nodeType: "fs:tiktokPublish", nodeLabel: "TikTok", status: "error", details: check.error });
          setError(null);
          setPublishing(false);
          setStatus(null);
          return;
        }
        setStatus(`Processing... (${i * 3}s)`);
      }
      setError("Publish timeout");
    }
    setPublishing(false);
    setStatus(null);
  }, [id, edgesAll, nodesAll, title, privacy, connected, nodeData.widgetValues]);

  // Highlighting — accept VIDEO, IMAGE, MEDIA for video input
  const videoHL = connectingDir === "source" && (connectingType === "VIDEO" || connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const textHL = connectingDir === "source" && connectingType === "TEXT" ? "highlight" : "";
  const hasCompatible = connectingType ? !!(videoHL || textHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  return (
    <div
      className={`tiktok-node ${selected ? "selected" : ""} ${dimClass}`}
      onClick={() => setSelectedNode(id)}
    >
      <div className="tiktok-node-inner">
        <div className="tiktok-accent" />
        <div className="tiktok-header">
          <span className="tiktok-icon">📤</span>
          <div className="tiktok-header-text">
            <span className="tiktok-title">TikTok Publish</span>
            <span className="tiktok-status" style={{ color: connected ? "#81c784" : "#ef5350" }}>
              {publishing ? "PUBLISHING..." : connected ? "CONNECTED" : "NOT CONNECTED"}
            </span>
          </div>
        </div>
      </div>

      {/* Inputs */}
      <div className="tiktok-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="video"
            className={`slot-handle ${videoHL}`} style={{ color: "#e85d75" }} />
          <TypeBadge color="#e85d75">VID</TypeBadge>
          <span className="nanob-input-label">Video</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="caption"
            className={`slot-handle ${textHL}`} style={{ color: "#f0c040" }} />
          <TypeBadge color="#f0c040">TEXT</TypeBadge>
          <span className="nanob-input-label">Caption</span>
        </div>
      </div>

      {/* Connect / Publish */}
      <div className="tiktok-content">
        {!connected ? (
          <button className="tiktok-connect-btn" onClick={handleConnect}>
            Connect TikTok
          </button>
        ) : (
          <div className="tiktok-privacy">
            {PRIVACY_OPTIONS.map((p) => (
              <button
                key={p.id}
                className={`tiktok-privacy-btn ${privacy === p.id ? "active" : ""}`}
                onClick={(e) => { e.stopPropagation(); updateWidgetValue(id, "privacy", p.id); }}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {status && <div className="videogen-status-bar">{status}</div>}
      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button
          className={`localgen-generate-btn ${publishing ? "generating" : ""}`}
          onClick={handlePublish}
          disabled={publishing || !connected}
        >
          {publishing ? "Publishing..." : "📤 Publish"}
        </button>
      </div>

      {/* Last publish status — persistent, hidden while publishing */}
      {nodeData.widgetValues?._lastPublish && !publishing && (
        <div className="tiktok-last-status">
          <span>{nodeData.widgetValues._lastPublish.message}</span>
          <span className="tiktok-last-time">
            {new Date(nodeData.widgetValues._lastPublish.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      )}
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

export default memo(TikTokPublishNode);
