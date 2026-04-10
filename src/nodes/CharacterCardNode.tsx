import { memo, useCallback, useState, useEffect, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";

type CardStatus = "draft" | "approved" | "rejected";

function CharacterCardNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const name = nodeData.widgetValues?.name || "";
  const description = nodeData.widgetValues?.description || "";
  const portraitUrl = nodeData.widgetValues?.portraitUrl || null;
  const status: CardStatus = nodeData.widgetValues?.status || "draft";

  const [dragOver, setDragOver] = useState(false);
  const lastPortraitRef = useRef<string | null>(null);

  // ── Auto-pull portrait from connected generator ──────────────────
  useEffect(() => {
    // Find edge connected to portrait_input
    const portraitEdge = edgesAll.find((e) => e.target === id && e.targetHandle === "portrait_input");
    if (!portraitEdge) return;

    // Find source node
    const sourceNode = nodesAll.find((n) => n.id === portraitEdge.source);
    if (!sourceNode) return;

    const sourceData = sourceNode.data as any;
    // Check _previewUrl (LocalGen, NanoBanana) or _preview (Import)
    const sourceUrl = sourceData.widgetValues?._previewUrl || sourceData.widgetValues?._preview || null;

    if (sourceUrl && sourceUrl !== lastPortraitRef.current) {
      lastPortraitRef.current = sourceUrl;
      // Convert to data URL for persistence
      fetch(sourceUrl)
        .then((r) => r.blob())
        .then((blob) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (reader.result && typeof reader.result === "string") {
              updateWidgetValue(id, "portraitUrl", reader.result);
            }
          };
          reader.readAsDataURL(blob);
        })
        .catch(() => {
          // Fallback: use URL directly (may not persist)
          updateWidgetValue(id, "portraitUrl", sourceUrl);
        });
    }
  }, [id, edgesAll, nodesAll, updateWidgetValue]);

  // ── Auto-pull text from connected AI input ───────────────────────
  useEffect(() => {
    const textEdge = edgesAll.find((e) => e.target === id && e.targetHandle === "ai_input");
    if (!textEdge) return;

    const sourceNode = nodesAll.find((n) => n.id === textEdge.source);
    if (!sourceNode) return;

    const sourceData = sourceNode.data as any;
    const text = sourceData.widgetValues?.text;
    if (!text) return;

    // Try parsing as JSON (from AI generator)
    try {
      const parsed = JSON.parse(text);
      if (parsed.name && parsed.name !== name) updateWidgetValue(id, "name", parsed.name);
      if (parsed.description && parsed.description !== description) updateWidgetValue(id, "description", parsed.description);
    } catch {
      // Plain text → use as description if different
      if (text !== description) updateWidgetValue(id, "description", text);
    }
  }, [id, edgesAll, nodesAll]);

  const handleApprove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    updateWidgetValue(id, "status", "approved");
  }, [id, updateWidgetValue]);

  const handleReject = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    updateWidgetValue(id, "status", "rejected");
  }, [id, updateWidgetValue]);

  const handleReset = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    updateWidgetValue(id, "status", "draft");
  }, [id, updateWidgetValue]);

  // Drop portrait image
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const mediaData = e.dataTransfer.getData("application/flowstudio-media");
    if (mediaData) {
      try {
        const { url, type } = JSON.parse(mediaData);
        if (url && type === "image") {
          updateWidgetValue(id, "portraitUrl", url);
          return;
        }
      } catch { /* fall through */ }
    }

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) updateWidgetValue(id, "portraitUrl", reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, [id, updateWidgetValue]);

  // Connection highlighting
  const aiInputHL = connectingDir === "source" && connectingType === "TEXT" ? "highlight" : "";
  const portraitInputHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA") ? "highlight" : "";
  const charOutputHL = connectingDir === "target" && (connectingType === "CHARACTER" || connectingType === "TEXT" || connectingType === "*") ? "highlight" : "";
  const imgOutputHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "*") ? "highlight" : "";

  const hasCompatible = connectingType ? !!(aiInputHL || portraitInputHL || charOutputHL || imgOutputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  const statusColor = status === "approved" ? "#4caf50" : status === "rejected" ? "#ef5350" : "#888";
  const statusLabel = status === "approved" ? "APPROVED" : status === "rejected" ? "REJECTED" : "DRAFT";

  return (
    <div
      className={`charcard-node ${selected ? "selected" : ""} ${dimClass} status-${status}`}
      onClick={() => setSelectedNode(id)}
    >
      <div className="charcard-node-inner">
        <div className="charcard-accent" />
        <div className="charcard-header">
          <span className="charcard-icon">🎭</span>
          <div className="charcard-header-text">
            <span className="charcard-title">{name || "Character Card"}</span>
            <span className="charcard-status" style={{ color: statusColor }}>{statusLabel}</span>
          </div>
        </div>
      </div>

      {/* Inputs */}
      <div className="charcard-inputs">
        <div className="charcard-input-row">
          <Handle type="target" position={Position.Left} id="ai_input"
            className={`slot-handle ${aiInputHL}`} style={{ color: "#f0c040" }} />
          <span className="charcard-badge" style={{ color: "#f0c040", borderColor: "#f0c04066", backgroundColor: "#f0c04012" }}>TEXT</span>
          <span className="charcard-input-label">Description</span>
        </div>
        <div className="charcard-input-row">
          <Handle type="target" position={Position.Left} id="portrait_input"
            className={`slot-handle ${portraitInputHL}`} style={{ color: "#64b5f6" }} />
          <span className="charcard-badge" style={{ color: "#64b5f6", borderColor: "#64b5f666", backgroundColor: "#64b5f612" }}>IMG</span>
          <span className="charcard-input-label">Portrait</span>
        </div>
      </div>

      {/* Portrait area */}
      <div
        className={`charcard-portrait ${dragOver ? "drag-over" : ""}`}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
      >
        {portraitUrl ? (
          <img src={portraitUrl} alt={name} className="charcard-portrait-img" />
        ) : (
          <div className="charcard-portrait-empty">
            <span>🎭</span>
            <span className="charcard-portrait-hint">Connect generator or drop image</span>
          </div>
        )}
      </div>

      {/* Name field */}
      <div className="charcard-field">
        <input
          type="text"
          className="charcard-name-input"
          value={name}
          onChange={(e) => updateWidgetValue(id, "name", e.target.value)}
          placeholder="Character name..."
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Description preview */}
      {description && (
        <div className="charcard-desc-preview">
          {description.length > 80 ? description.slice(0, 80) + "..." : description}
        </div>
      )}

      {/* Approve / Reject */}
      <div className="charcard-actions">
        {status === "draft" && (
          <>
            <button className="charcard-btn charcard-approve" onClick={handleApprove} title="Approve">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
            <button className="charcard-btn charcard-reject" onClick={handleReject} title="Reject">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </>
        )}
        {status !== "draft" && (
          <button className="charcard-btn charcard-reset" onClick={handleReset} title="Reset to draft">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
          </button>
        )}
      </div>

      {/* Outputs */}
      <div className="charcard-outputs">
        <div className="charcard-output-row">
          <span className="charcard-badge" style={{ color: "#a78bfa", borderColor: "#a78bfa66", backgroundColor: "#a78bfa12" }}>CHAR</span>
          <span className="charcard-output-label">Character</span>
          <Handle type="source" position={Position.Right} id="character_out"
            className={`slot-handle ${charOutputHL}`} style={{ color: "#a78bfa" }} />
        </div>
        <div className="charcard-output-row">
          <span className="charcard-badge" style={{ color: "#64b5f6", borderColor: "#64b5f666", backgroundColor: "#64b5f612" }}>IMG</span>
          <span className="charcard-output-label">Portrait</span>
          <Handle type="source" position={Position.Right} id="portrait_out"
            className={`slot-handle ${imgOutputHL}`} style={{ color: "#64b5f6" }} />
        </div>
      </div>
    </div>
  );
}

export default memo(CharacterCardNode);
