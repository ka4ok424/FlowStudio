import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";

const VIDEO_COLOR = "#e85d75";

interface ClipInfo {
  handleId: string;       // e.g. "video-0"
  url: string | null;
  duration: number;       // source video duration in seconds (auto-detected)
  trim: { start: number; end: number };  // user-set trim within source
}

const MIN_CLIPS = 2;
const MAX_CLIPS = 10;

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0.0";
  return s.toFixed(1);
}

function getConnectedVideoUrl(
  nodeId: string,
  handleId: string,
  nodes: any[],
  edges: any[],
): string | null {
  const edge = edges.find((e: any) => e.target === nodeId && e.targetHandle === handleId);
  if (!edge) return null;
  const src = nodes.find((n: any) => n.id === edge.source);
  if (!src) return null;
  const sd = src.data as any;
  // Multi-output support (Multi Crop / future) — pick by sourceHandle
  if (sd.widgetValues?._cellPreviews && edge.sourceHandle) {
    return sd.widgetValues._cellPreviews[edge.sourceHandle] || null;
  }
  return sd.widgetValues?._previewUrl || sd.widgetValues?._preview || null;
}

function MontageNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const wv = nodeData.widgetValues || {};
  const clipCount: number = Math.max(MIN_CLIPS, Math.min(MAX_CLIPS, wv.clipCount ?? 2));
  const audioMode: "keep" | "mute" = wv.audioMode || "keep";
  const trimsState: Record<string, { start: number; end: number }> = wv._clipTrims || {};
  const _previewUrl: string | null = wv._previewUrl || null;

  // Resolve clip URLs from upstream
  const clipUrls: (string | null)[] = [];
  for (let i = 0; i < clipCount; i++) {
    clipUrls.push(getConnectedVideoUrl(id, `video-${i}`, nodesAll as any[], edgesAll as any[]));
  }

  // Detected source durations (from <video> metadata events)
  const [durations, setDurations] = useState<Record<string, number>>({});

  // Build clips array (only connected ones for player)
  const clips: ClipInfo[] = [];
  for (let i = 0; i < clipCount; i++) {
    const handleId = `video-${i}`;
    const url = clipUrls[i];
    if (!url) continue;
    const duration = durations[handleId] || 0;
    const tr = trimsState[handleId];
    clips.push({
      handleId,
      url,
      duration,
      trim: {
        start: tr?.start ?? 0,
        end: (tr?.end != null) ? tr.end : duration,
      },
    });
  }
  const connectedCount = clips.length;
  const totalDuration = clips.reduce((s, c) => s + Math.max(0, c.trim.end - c.trim.start), 0);

  // ── Player state ─────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [montageTime, setMontageTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Reset player when clip set changes meaningfully
  useEffect(() => {
    setCurrentIdx(0);
    setMontageTime(0);
    setPlaying(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips.length, clips.map((c) => c.url).join("|")]);

  // Switch <video> src when current clip changes
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const c = clips[currentIdx];
    if (!c || !c.url) return;
    if (v.src !== c.url) v.src = c.url;
    // Seek to trim start once metadata loaded
    const onLoaded = () => {
      v.currentTime = Math.min(c.trim.start, (v.duration || 0) - 0.01);
      v.removeEventListener("loadedmetadata", onLoaded);
    };
    v.addEventListener("loadedmetadata", onLoaded);
    return () => v.removeEventListener("loadedmetadata", onLoaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, clips[currentIdx]?.url]);

  // Apply mute mode
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = audioMode === "mute";
  }, [audioMode, currentIdx]);

  // Source duration auto-detect — load each connected URL silently
  useEffect(() => {
    let cancelled = false;
    for (const c of clips) {
      if (durations[c.handleId]) continue;
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.crossOrigin = "anonymous";
      probe.src = c.url!;
      probe.onloadedmetadata = () => {
        if (cancelled) return;
        const d = probe.duration;
        if (!isNaN(d) && d > 0) {
          setDurations((prev) => ({ ...prev, [c.handleId]: d }));
          // Seed trim end if not set yet
          if (trimsState[c.handleId]?.end == null) {
            updateWidgetValue(id, "_clipTrims", {
              ...trimsState,
              [c.handleId]: {
                start: trimsState[c.handleId]?.start ?? 0,
                end: d,
              },
            });
          }
        }
      };
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips.map((c) => `${c.handleId}|${c.url}`).join(",")]);

  // Time tracking + auto-advance to next clip on trim.end
  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || !clips[currentIdx]) return;
    const tr = clips[currentIdx].trim;
    if (v.currentTime >= tr.end - 0.05) {
      if (currentIdx < clips.length - 1) {
        setCurrentIdx(currentIdx + 1);
      } else {
        v.pause();
        setPlaying(false);
        setMontageTime(totalDuration);
        return;
      }
    }
    const cumulative = clips.slice(0, currentIdx).reduce((s, c) => s + (c.trim.end - c.trim.start), 0);
    setMontageTime(cumulative + Math.max(0, v.currentTime - tr.start));
  }, [currentIdx, clips, totalDuration]);

  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setPlaying(false);
    } else {
      // If at end, restart
      if (montageTime >= totalDuration - 0.1) {
        setCurrentIdx(0);
        setMontageTime(0);
        v.currentTime = clips[0]?.trim.start ?? 0;
      }
      v.play().catch(() => {});
      setPlaying(true);
    }
  }, [playing, montageTime, totalDuration, clips]);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    updateWidgetValue(id, "audioMode", audioMode === "mute" ? "keep" : "mute");
  }, [audioMode, id, updateWidgetValue]);

  // Click on progress bar → seek to that overall time
  const onSeekProgress = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!totalDuration) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const target = Math.max(0, Math.min(totalDuration, pct * totalDuration));
    let acc = 0;
    for (let i = 0; i < clips.length; i++) {
      const dur = clips[i].trim.end - clips[i].trim.start;
      if (acc + dur >= target) {
        const offset = target - acc;
        setCurrentIdx(i);
        const v = videoRef.current;
        if (v) {
          // Wait for src to be set if changing clip
          setTimeout(() => {
            if (v) v.currentTime = clips[i].trim.start + offset;
          }, 30);
        }
        setMontageTime(target);
        return;
      }
      acc += dur;
    }
  }, [clips, totalDuration]);

  // Trim handle dragging (per-clip start/end)
  const onTrimDrag = useCallback((handleId: string, side: "start" | "end") => (e: React.PointerEvent) => {
    e.stopPropagation();
    const target = e.currentTarget as HTMLDivElement;
    const bar = target.parentElement;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const dur = durations[handleId];
    if (!dur) return;
    const startMouseX = e.clientX;
    const startVal = trimsState[handleId]?.[side] ?? (side === "start" ? 0 : dur);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startMouseX;
      const dpct = dx / rect.width;
      let newVal = startVal + dpct * dur;
      newVal = Math.max(0, Math.min(dur, newVal));
      // Constrain start < end with min 0.1s gap
      const cur = trimsState[handleId] || { start: 0, end: dur };
      const next = { ...cur };
      if (side === "start") {
        next.start = Math.min(newVal, (cur.end ?? dur) - 0.1);
      } else {
        next.end = Math.max(newVal, (cur.start ?? 0) + 0.1);
      }
      updateWidgetValue(id, "_clipTrims", { ...trimsState, [handleId]: next });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, [durations, trimsState, id, updateWidgetValue]);

  const addClip = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (clipCount >= MAX_CLIPS) return;
    updateWidgetValue(id, "clipCount", clipCount + 1);
  }, [clipCount, id, updateWidgetValue]);

  const removeClip = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (clipCount <= MIN_CLIPS) return;
    // Drop trim state for the dropped handle
    const dropped = `video-${clipCount - 1}`;
    if (trimsState[dropped]) {
      const rest: Record<string, { start: number; end: number }> = {};
      for (const k of Object.keys(trimsState)) if (k !== dropped) rest[k] = trimsState[k];
      updateWidgetValue(id, "_clipTrims", rest);
    }
    updateWidgetValue(id, "clipCount", clipCount - 1);
  }, [clipCount, trimsState, id, updateWidgetValue]);

  const onRunMontage = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Phase 1 stub — render comes in Phase 2 (ffmpeg.wasm)
    alert("Render coming in Phase 2 (ffmpeg.wasm). Phase 1 = preview + trim only.");
  }, []);

  // Status
  const status = !connectedCount ? "NO INPUT"
    : _previewUrl ? "READY"
    : "STALE";

  // Highlights
  const inHL = connectingDir === "source" && (connectingType === "VIDEO" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const outHL = connectingDir === "target" && (connectingType === "VIDEO" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const dimClass = connectingType ? ((inHL || outHL) ? "compatible" : "incompatible") : "";

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className={`montage-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="montage-node-inner">
        <div className="montage-accent" />
        <div className="montage-header">
          <span className="montage-icon">▶▶</span>
          <div className="montage-header-text">
            <span className="montage-title">Montage</span>
            <span className="montage-status">{status}</span>
          </div>
        </div>
      </div>

      {/* Input handles — dynamic by clipCount */}
      <div className="montage-inputs">
        {Array.from({ length: clipCount }).map((_, i) => {
          const handleId = `video-${i}`;
          const connected = !!clipUrls[i];
          return (
            <div key={handleId} className="nanob-input-row">
              <Handle
                type="target"
                position={Position.Left}
                id={handleId}
                className={`slot-handle ${inHL}`}
                style={{ color: VIDEO_COLOR }}
              />
              <span className="type-badge" style={{
                color: VIDEO_COLOR,
                borderColor: VIDEO_COLOR + "66",
                backgroundColor: VIDEO_COLOR + "12",
                opacity: connected ? 1 : 0.5,
              }}>VIDEO</span>
              <span className="nanob-input-label">video-{i}</span>
            </div>
          );
        })}
        <div className="montage-add-row" onClick={(e) => e.stopPropagation()}>
          <button className="montage-addrm-btn" onClick={removeClip} disabled={clipCount <= MIN_CLIPS} title="Remove last clip slot">−</button>
          <span className="montage-addrm-label">{clipCount} slots</span>
          <button className="montage-addrm-btn" onClick={addClip} disabled={clipCount >= MAX_CLIPS} title="Add another clip slot">+</button>
        </div>
      </div>

      {/* Preview player */}
      <div className="montage-preview-wrap nodrag" onClick={(e) => e.stopPropagation()}>
        {connectedCount > 0 ? (
          <>
            <video
              ref={videoRef}
              className="montage-preview-video"
              playsInline
              crossOrigin="anonymous"
              onTimeUpdate={onTimeUpdate}
              onEnded={() => {
                if (currentIdx < clips.length - 1) setCurrentIdx(currentIdx + 1);
                else { setPlaying(false); setMontageTime(totalDuration); }
              }}
            />
            <div className="montage-controls-bar">
              <button className="montage-icon-btn" onClick={togglePlay} title={playing ? "Pause" : "Play"}>
                {playing ? "❚❚" : "▶"}
              </button>
              <span className="montage-time-readout">
                <span className="montage-time-cur">{fmtTime(montageTime)}</span>
                <span className="montage-time-sep"> / </span>
                <span className="montage-time-total">{fmtTime(totalDuration)}</span>
                <span className="montage-time-clip">  C{currentIdx + 1}/{clips.length}</span>
              </span>
              <button className="montage-icon-btn" onClick={toggleMute} title={audioMode === "mute" ? "Unmute" : "Mute"}>
                {audioMode === "mute" ? "🔇" : "🔊"}
              </button>
            </div>
            {/* Progress bar with clip dividers */}
            <div className="montage-progress" onClick={onSeekProgress}>
              <div className="montage-progress-fill" style={{ width: `${totalDuration ? (montageTime / totalDuration) * 100 : 0}%` }} />
              {clips.slice(0, -1).map((_, i) => {
                const cumulative = clips.slice(0, i + 1).reduce((s, c) => s + (c.trim.end - c.trim.start), 0);
                return (
                  <div key={i} className="montage-progress-divider" style={{ left: `${(cumulative / totalDuration) * 100}%` }} />
                );
              })}
            </div>
          </>
        ) : (
          <div className="montage-placeholder">
            <span className="montage-placeholder-icon">▶▶</span>
            <span className="montage-placeholder-text">Connect at least one VIDEO input</span>
          </div>
        )}
      </div>

      {connectedCount > 0 && (
        <div className="montage-stats nodrag" onClick={(e) => e.stopPropagation()}>
          <span><span className="montage-stat-label">Clips:</span> <span className="montage-stat-value">{connectedCount}</span></span>
          <span><span className="montage-stat-label">Total:</span> <span className="montage-stat-value">{fmtTime(totalDuration)}s</span></span>
        </div>
      )}

      {connectedCount > 0 && (
        <div className="montage-actions nodrag" onClick={(e) => e.stopPropagation()}>
          <button className="montage-run-btn" onClick={onRunMontage} title="Render concatenated MP4 (Phase 2)">
            <span style={{ fontSize: 12 }}>▶</span> Run Montage
          </button>
        </div>
      )}

      {/* Timeline section with trim handles per clip */}
      {connectedCount > 0 && (
        <div className="montage-timeline nodrag" onClick={(e) => e.stopPropagation()}>
          <div className="montage-timeline-header">
            <span className="montage-timeline-icon">≡</span>
            <span className="montage-timeline-title">Timeline</span>
            <span className="montage-timeline-meta">{fmtTime(totalDuration)}s · 1.0×</span>
          </div>
          <div className="montage-timeline-tracks">
            {clips.map((clip, i) => {
              const dur = clip.duration || 1;
              const trimW = ((clip.trim.end - clip.trim.start) / dur) * 100;
              const trimL = (clip.trim.start / dur) * 100;
              return (
                <div key={clip.handleId} className="montage-timeline-track">
                  <div className="montage-timeline-bar">
                    {/* Full source duration as a faint background */}
                    <div className="montage-timeline-source" />
                    {/* Trimmed region */}
                    <div
                      className="montage-timeline-trim"
                      style={{ left: `${trimL}%`, width: `${trimW}%` }}
                    >
                      <div
                        className="montage-trim-handle left"
                        onPointerDown={onTrimDrag(clip.handleId, "start")}
                      />
                      <div className="montage-timeline-label">C{i + 1} {fmtTime(clip.trim.end - clip.trim.start)}s</div>
                      <div
                        className="montage-trim-handle right"
                        onPointerDown={onTrimDrag(clip.handleId, "end")}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="montage-timeline-badges">
            {clips.map((clip, i) => (
              <span key={clip.handleId} className="montage-timeline-badge">
                C{i + 1} {fmtTime(clip.trim.start)}–{fmtTime(clip.trim.end)}s
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Output handle */}
      <div className="montage-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <span className="type-badge" style={{ color: VIDEO_COLOR, borderColor: VIDEO_COLOR + "66", backgroundColor: VIDEO_COLOR + "12" }}>VIDEO</span>
          <span className="nanob-output-label">Output</span>
          <Handle
            type="source"
            position={Position.Right}
            id="output_0"
            className={`slot-handle ${outHL}`}
            style={{ color: VIDEO_COLOR }}
          />
        </div>
      </div>
    </div>
  );
}

export default memo(MontageNode);
