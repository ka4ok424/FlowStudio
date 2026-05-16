import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt, getImageUrl, uploadImage, getComfyUrl, stopAll } from "../api/comfyApi";
import { addGenerationToLibrary } from "../store/mediaStore";
import { addToHistory } from "../utils/historyLimit";
import { log } from "../store/logStore";
import { buildMontageWorkflow, type MontageClipParam } from "../workflows/montage";

const VIDEO_COLOR = "#e85d75";
const CLIP_COLOR = "#a78bfa";

// Pick a "nice" tick step so the ruler shows ~targetTicks labels without crowding.
function pickRulerStep(totalSec: number, targetTicks: number): number {
  const raw = totalSec / Math.max(1, targetTicks);
  const nice = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  for (const s of nice) if (s >= raw) return s;
  return Math.ceil(raw / 60) * 60;
}

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
  const clipMeta: Record<string, { fps: number; width: number; height: number; hasAudio?: boolean }> = wv._clipMeta || {};
  const _previewUrl: string | null = wv._previewUrl || null;
  const _genTime: number | undefined = wv._genTime;

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);
  const [showModal, setShowModal] = useState(false);

  // Frame-scrub during trim drag.
  // Inline mode: live-seek the main preview video to show the frame being trimmed.
  // Modal mode: hidden video + canvas tooltip floating near the cursor.
  const seekVideoRef = useRef<HTMLVideoElement | null>(null);
  const seekCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const seekStateRef = useRef<{ pending: number | null; active: boolean }>({ pending: null, active: false });
  const [scrubTip, setScrubTip] = useState<{ x: number; y: number; clipIndex: number; time: number } | null>(null);

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

  // Switch <video> src when current clip changes. Resume playback if we were
  // mid-stream so clip-to-clip transitions don't pause.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const c = clips[currentIdx];
    if (!c || !c.url) return;
    const wasPlaying = playing;
    const wantSrc = c.url;
    const seekAndMaybePlay = () => {
      try {
        v.currentTime = Math.min(c.trim.start, (v.duration || 0) - 0.01);
      } catch { /* ignore */ }
      if (wasPlaying) v.play().catch(() => {});
    };
    if (v.src !== wantSrc) {
      // Hide flash of old frame while loading
      v.style.opacity = "0";
      v.src = wantSrc;
      const onLoaded = () => {
        v.removeEventListener("loadedmetadata", onLoaded);
        seekAndMaybePlay();
        v.style.opacity = "1";
      };
      v.addEventListener("loadedmetadata", onLoaded);
      return () => v.removeEventListener("loadedmetadata", onLoaded);
    } else {
      seekAndMaybePlay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, clips[currentIdx]?.url]);

  // Preload neighbouring clip so the next switch is instant (decoder warm).
  useEffect(() => {
    const next = clips[currentIdx + 1];
    if (!next?.url) return;
    const pre = document.createElement("video");
    pre.preload = "auto";
    pre.muted = true;
    pre.src = next.url;
    return () => { pre.removeAttribute("src"); pre.load(); };
  }, [currentIdx, clips]);

  // Apply mute mode
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = audioMode === "mute";
  }, [audioMode, currentIdx]);

  // Source metadata auto-detect — duration via loadedmetadata, fps via rVFC sampling
  useEffect(() => {
    let cancelled = false;
    for (const c of clips) {
      if (durations[c.handleId] && clipMeta[c.handleId]?.fps) continue;
      const probe = document.createElement("video");
      probe.preload = "auto";
      probe.muted = true;
      probe.playsInline = true;
      probe.crossOrigin = "anonymous";
      const finishMeta = (fps: number) => {
        if (cancelled) return;
        const cur = (useWorkflowStore.getState().nodes.find((n) => n.id === id)?.data as any)?.widgetValues?._clipMeta || {};
        const p = probe as any;
        const hasAudio = !!p.webkitAudioDecodedByteCount || !!p.mozHasAudio || !!(p.audioTracks && p.audioTracks.length > 0);
        updateWidgetValue(id, "_clipMeta", {
          ...cur,
          [c.handleId]: { fps, width: probe.videoWidth, height: probe.videoHeight, hasAudio },
        });
        try { probe.pause(); } catch { /* ignore */ }
        probe.removeAttribute("src");
        probe.load();
      };
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
        // FPS sampling via requestVideoFrameCallback (5 deltas → median)
        if ("requestVideoFrameCallback" in probe) {
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
              (probe as any).requestVideoFrameCallback(onFrame);
            } else {
              samples.sort((a, b) => a - b);
              const median = samples[Math.floor(samples.length / 2)];
              finishMeta(median > 0 ? Math.round(1 / median) : 24);
            }
          };
          (probe as any).requestVideoFrameCallback(onFrame);
          probe.play().catch(() => finishMeta(24));
        } else {
          finishMeta(24);
        }
      };
      probe.src = c.url!;
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

  // Throttled seek + frame-presented callback. Uses rVFC when present so we
  // never queue more than one seek at a time — pending time is replaced; the
  // next seek runs after the current frame is actually presented.
  //
  // Belt-and-suspenders termination: rVFC + `seeked` event + 300ms watchdog,
  // all guarded by `firedDone` so finish runs exactly once. The watchdog is
  // critical: rVFC silently doesn't fire when the compositor decides a tiny
  // offscreen <video> isn't worth painting, which used to leave `st.active`
  // true forever and freeze the scrub thumbnail.
  const scrubSeek = useCallback((v: HTMLVideoElement, t: number, onFrame?: () => void) => {
    const st = seekStateRef.current;
    if (st.active) { st.pending = t; return; }
    const target = (() => {
      const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : t + 1;
      return Math.max(0, Math.min(t, dur - 0.001));
    })();
    // Skip no-op seeks (same frame) — currentTime= is a no-op when equal, so
    // rVFC/seeked would never fire and the pipeline would deadlock.
    if (Math.abs(target - v.currentTime) < 0.005) { onFrame?.(); return; }
    st.active = true;
    try {
      v.currentTime = target;
    } catch { st.active = false; return; }

    const va: any = v;
    let firedDone = false;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const onSeeked = () => { finish(); };
    const finish = () => {
      if (firedDone) return;
      firedDone = true;
      if (watchdog) { clearTimeout(watchdog); watchdog = null; }
      va.removeEventListener("seeked", onSeeked);
      st.active = false;
      onFrame?.();
      if (st.pending != null) {
        const next = st.pending; st.pending = null;
        scrubSeek(v, next, onFrame);
      }
    };
    if (typeof va.requestVideoFrameCallback === "function") {
      va.requestVideoFrameCallback(finish);
    }
    va.addEventListener("seeked", onSeeked);
    watchdog = setTimeout(finish, 300);
  }, []);

  // Drag the whole trim window (slip edit — length unchanged, source in/out shift)
  const onTrimShift = useCallback((handleId: string, scaleDur: number, onScrub?: (sourceTime: number, x: number, y: number) => void, onScrubEnd?: () => void) => (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).classList.contains("montage-trim-handle")) return;
    e.stopPropagation();
    const target = e.currentTarget as HTMLDivElement;
    const bar = target.parentElement;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const dur = durations[handleId];
    if (!dur) return;
    const cur = trimsState[handleId] || { start: 0, end: dur };
    const startMouseX = e.clientX;
    const startStart = cur.start;
    const startEnd = cur.end;

    const onMove = (ev: PointerEvent) => {
      const dt = ((ev.clientX - startMouseX) / rect.width) * scaleDur;
      let ns = startStart + dt;
      let ne = startEnd + dt;
      if (ns < 0) { ne -= ns; ns = 0; }
      if (ne > dur) { ns -= (ne - dur); ne = dur; }
      updateWidgetValue(id, "_clipTrims", { ...trimsState, [handleId]: { start: ns, end: ne } });
      onScrub?.(ns, ev.clientX, ev.clientY);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      onScrubEnd?.();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, [durations, trimsState, id, updateWidgetValue]);

  // Trim handle drag (per-clip start/end). scaleDur = bar's time scale (output total).
  const onTrimDrag = useCallback((handleId: string, side: "start" | "end", scaleDur: number, onScrub?: (sourceTime: number, x: number, y: number) => void, onScrubEnd?: () => void) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const target = e.currentTarget as HTMLDivElement;
    const bar = target.parentElement?.parentElement;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const dur = durations[handleId];
    if (!dur) return;
    const startMouseX = e.clientX;
    const cur = trimsState[handleId] || { start: 0, end: dur };
    const startVal = cur[side];

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startMouseX;
      const dpct = dx / rect.width;
      let newVal = startVal + dpct * scaleDur;
      newVal = Math.max(0, Math.min(dur, newVal));
      const next = { ...cur };
      if (side === "start") next.start = Math.min(newVal, cur.end - 0.1);
      else next.end = Math.max(newVal, cur.start + 0.1);
      updateWidgetValue(id, "_clipTrims", { ...trimsState, [handleId]: next });
      onScrub?.(side === "start" ? next.start : next.end, ev.clientX, ev.clientY);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      onScrubEnd?.();
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

  const onRunMontage = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!connectedCount) return;
    setProcessing(true);
    setError(null);
    abortRef.current = false;
    const startTime = Date.now();

    try {
      // Output params from clip 1
      const meta1 = clipMeta[clips[0].handleId];
      const outputFps = meta1?.fps && meta1.fps > 0 ? meta1.fps : 24;

      const uploaded: MontageClipParam[] = [];
      for (let i = 0; i < clips.length; i++) {
        if (abortRef.current) throw new Error("Stopped");
        const c = clips[i];
        const fileName = `fs_montage_in_${id}_${i}_${Date.now()}.mp4`;
        let upName: string;
        if (c.url!.startsWith("data:")) {
          upName = await uploadImage(c.url!, fileName);
        } else {
          const resp = await fetch(c.url!);
          const blob = await resp.blob();
          const dataUrl: string = await new Promise((r) => {
            const rd = new FileReader();
            rd.onloadend = () => r(rd.result as string);
            rd.readAsDataURL(blob);
          });
          upName = await uploadImage(dataUrl, fileName);
        }
        const cMeta = clipMeta[c.handleId];
        const nativeFps = cMeta?.fps && cMeta.fps > 0 ? cMeta.fps : outputFps;
        const skipFrames = Math.max(0, Math.round(c.trim.start * nativeFps));
        const totalFrames = Math.max(1, Math.round((c.trim.end - c.trim.start) * nativeFps));
        uploaded.push({
          filename: upName,
          skipFrames,
          frameCap: totalFrames,
          // Resample clips 1..N to clip-0 fps for consistent concat; clip 0 stays native
          forceRate: i === 0 ? 0 : outputFps,
        });
      }

      // Only chain audio if user wants it AND every clip actually has an audio track —
      // VHS_LoadVideo throws if asked to extract audio from a silent file, and AudioConcat
      // can't bridge over a missing track.
      const allHaveAudio = clips.every((c) => clipMeta[c.handleId]?.hasAudio);
      const includeAudio = audioMode === "keep" && allHaveAudio;

      const workflow = buildMontageWorkflow({
        clips: uploaded,
        outputFps,
        includeAudio,
      });

      log("Montage rendering", { nodeId: id, nodeType: "fs:montage", nodeLabel: "Montage", details: `${connectedCount} clips @ ${outputFps}fps${includeAudio ? " +audio" : ""}` });
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
              const media = outputs[nId]?.videos || outputs[nId]?.gifs || outputs[nId]?.images;
              if (media && media.length > 0) {
                const m = media[media.length - 1];
                const apiUrl = getImageUrl(m.filename, m.subfolder, m.type);
                updateWidgetValue(id, "_genTime", Date.now() - startTime);
                updateWidgetValue(id, "_previewUrl", apiUrl);
                const prevHist: string[] = (useWorkflowStore.getState().nodes.find((n) => n.id === id)?.data as any)?.widgetValues?._history || [];
                const { history: newHist, index: newIdx } = await addToHistory(id, prevHist, apiUrl);
                updateWidgetValue(id, "_history", newHist);
                updateWidgetValue(id, "_historyIndex", newIdx);
                log("Montage complete", { nodeId: id, nodeType: "fs:montage", nodeLabel: "Montage", status: "success", details: `${connectedCount} clips · ${totalDuration.toFixed(1)}s @ ${outputFps}fps` });
                addGenerationToLibrary(apiUrl, {
                  prompt: `montage ${connectedCount} clips`,
                  model: "Concat",
                  seed: "0",
                  steps: 0,
                  cfg: 0,
                  width: meta1?.width || 0,
                  height: meta1?.height || 0,
                  nodeType: "fs:montage",
                  duration: Date.now() - startTime,
                }, "video");
                setProcessing(false);
                return;
              }
            }
            const st = history[promptId].status;
            if (st?.completed || st?.status_str === "error") {
              const errMsg = history[promptId].status?.messages?.find((m: any) => m[0] === "execution_error");
              setError(errMsg ? errMsg[1]?.exception_message?.slice(0, 120) : "Render failed");
              log("Montage failed", { nodeId: id, nodeType: "fs:montage", nodeLabel: "Montage", status: "error" });
              setProcessing(false);
              return;
            }
          }
        } catch { /* keep polling */ }
      }
      setError("Timeout"); setProcessing(false);
    } catch (err: any) {
      setError(err.message || String(err));
      log("Montage error", { nodeId: id, nodeType: "fs:montage", nodeLabel: "Montage", status: "error", details: err.message || String(err) });
      setProcessing(false);
    }
  }, [connectedCount, clips, clipMeta, audioMode, id, totalDuration, updateWidgetValue]);

  // Status
  const status = processing ? "RENDERING..."
    : !connectedCount ? "NO INPUT"
    : _previewUrl ? "READY"
    : "STALE";

  // Render the staircase timeline. Used both inline (compact) and inside the
  // popup modal (large, with bigger handles + denser ruler).
  const renderTimeline = (modal: boolean) => {
    let cum = 0;
    const positions = clips.map((c) => {
      const len = Math.max(0, c.trim.end - c.trim.start);
      const out = { handleId: c.handleId, outStart: cum, outLen: len };
      cum += len;
      return out;
    });
    const scaleDur = totalDuration > 0 ? totalDuration : 0.0001;
    const step = pickRulerStep(scaleDur, modal ? 16 : 6);
    const ticks: number[] = [];
    for (let t = 0; t <= scaleDur + 1e-6; t += step) ticks.push(Math.round(t * 100) / 100);

    const drawTooltipFrame = () => {
      const v = seekVideoRef.current; const c = seekCanvasRef.current;
      if (!v || !c || !v.videoWidth) return;
      const aspect = v.videoWidth / v.videoHeight;
      const W = 240; const H = Math.round(W / aspect);
      if (c.width !== W) c.width = W;
      if (c.height !== H) c.height = H;
      const ctx = c.getContext("2d"); if (!ctx) return;
      ctx.drawImage(v, 0, 0, W, H);
    };
    // Same scrub behaviour everywhere: hidden video decoder → canvas → floating
    // tooltip pinned to cursor. Works in inline node and in modal alike.
    const buildScrub = (i: number, clipUrl: string) => ({
      onScrub: (sourceTime: number, x: number, y: number) => {
        const v = seekVideoRef.current; if (!v) return;
        if (v.src !== clipUrl) v.src = clipUrl;
        setScrubTip({ x, y, clipIndex: i, time: sourceTime });
        scrubSeek(v, sourceTime, drawTooltipFrame);
      },
      onScrubEnd: () => {
        setScrubTip(null);
        const v = seekVideoRef.current;
        if (v) { try { v.pause(); } catch { /* ignore */ } v.removeAttribute("src"); v.load(); }
        seekStateRef.current = { pending: null, active: false };
      },
    });

    return (
      <div className={`montage-timeline nodrag ${modal ? "in-modal" : ""}`} onClick={(e) => e.stopPropagation()}>
        {!modal && (
          <div
            className="montage-timeline-header"
            onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
            style={{ cursor: "pointer", userSelect: "none" }}
            title="Open full editor"
          >
            <span className="montage-timeline-icon">⛶</span>
            <span className="montage-timeline-title">Trim sources</span>
            <span className="montage-timeline-meta">{fmtTime(totalDuration)}s output</span>
          </div>
        )}
        <div className="montage-tracks-area">
          <div className="montage-tracks-inner">
            <div className="montage-source-row montage-ruler-row">
              <span className="montage-source-tag" style={{ visibility: "hidden" }}>C0</span>
              <div className="montage-source-bar-wrap">
                <div className="montage-timeline-ruler">
                  {ticks.map((t) => (
                    <div key={t} className="montage-ruler-tick" style={{ left: `${(t / scaleDur) * 100}%` }}>
                      <span className="montage-ruler-label">{t % 1 === 0 ? `${t}s` : `${t.toFixed(1)}s`}</span>
                    </div>
                  ))}
                </div>
              </div>
              <span className="montage-source-meta" style={{ visibility: "hidden" }}>src 0s</span>
            </div>
            {clips.map((clip, i) => {
              const dur = clip.duration || 1;
              const pos = positions[i];
              const leftPct = (pos.outStart / scaleDur) * 100;
              const widthPct = (pos.outLen / scaleDur) * 100;
              const scrub = buildScrub(i, clip.url!);
              return (
                <div key={clip.handleId} className="montage-source-row">
                  <span className="montage-source-tag" style={{ background: CLIP_COLOR + "22", borderColor: CLIP_COLOR, color: CLIP_COLOR }}>
                    C{i + 1}
                  </span>
                  <div className="montage-source-bar-wrap">
                    <div className="montage-timeline-bar">
                      {ticks.map((t) => (
                        <div key={t} className="montage-bar-tick" style={{ left: `${(t / scaleDur) * 100}%` }} />
                      ))}
                      <div
                        className="montage-timeline-trim"
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          background: CLIP_COLOR + "55",
                          borderColor: CLIP_COLOR,
                          cursor: "grab",
                        }}
                        onPointerDown={onTrimShift(clip.handleId, scaleDur, scrub.onScrub, scrub.onScrubEnd)}
                      >
                        <div className="montage-trim-handle left" onPointerDown={onTrimDrag(clip.handleId, "start", scaleDur, scrub.onScrub, scrub.onScrubEnd)} />
                        <div className="montage-timeline-label">{fmtTime(pos.outLen)}s</div>
                        <div className="montage-trim-handle right" onPointerDown={onTrimDrag(clip.handleId, "end", scaleDur, scrub.onScrub, scrub.onScrubEnd)} />
                      </div>
                    </div>
                  </div>
                  <span className="montage-source-meta">src {fmtTime(dur)}s</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

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
            {/* Sequence strip — colored block per clip, width = trimmed/total. Click to seek. */}
            <div className="montage-sequence" onClick={onSeekProgress} title="Click to seek">
              {clips.map((clip, i) => {
                const widthPct = totalDuration > 0 ? ((clip.trim.end - clip.trim.start) / totalDuration) * 100 : 0;
                const active = i === currentIdx;
                return (
                  <div
                    key={clip.handleId}
                    className={`montage-seq-clip ${active ? "active" : ""}`}
                    style={{
                      width: `${widthPct}%`,
                      background: CLIP_COLOR,
                      borderColor: active ? "#fff" : CLIP_COLOR,
                      // Subtle alternating shade so adjacent clips remain distinguishable with one colour
                      filter: i % 2 === 1 ? "brightness(0.82)" : undefined,
                    }}
                  >
                    <span className="montage-seq-label">C{i + 1}</span>
                    <span className="montage-seq-dur">{fmtTime(clip.trim.end - clip.trim.start)}s</span>
                  </div>
                );
              })}
              <div
                className="montage-seq-playhead"
                style={{ left: `${totalDuration ? (montageTime / totalDuration) * 100 : 0}%` }}
              />
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

      {error && <div className="nanob-error nodrag" onClick={(e) => e.stopPropagation()}>{error}</div>}

      {connectedCount > 0 && (
        <div className="montage-actions nodrag" onClick={(e) => e.stopPropagation()}>
          {processing ? (
            <button className="montage-run-btn generating" onClick={(e) => {
              e.stopPropagation();
              abortRef.current = true;
              stopAll().catch(() => {});
            }} title="Stop">
              <span style={{ fontSize: 12 }}>■</span> Stop
            </button>
          ) : (
            <button className="montage-run-btn" onClick={onRunMontage} title="Concatenate clips into a single MP4 on ComfyUI">
              <span style={{ fontSize: 12 }}>▶</span> Run Montage
            </button>
          )}
        </div>
      )}

      {_previewUrl && !processing && (
        <div className="montage-output-wrap nodrag" onClick={(e) => e.stopPropagation()} style={{ marginTop: 6 }}>
          <video src={_previewUrl} controls playsInline className="montage-preview-video" style={{ width: "100%", borderRadius: 4 }} />
          {_genTime != null && (
            <div className="montage-stat-label" style={{ fontSize: 11, marginTop: 2, opacity: 0.7 }}>
              rendered in {(_genTime / 1000).toFixed(1)}s
            </div>
          )}
        </div>
      )}

      {connectedCount > 0 && renderTimeline(false)}

      {showModal && createPortal(
        <div
          className="montage-modal-overlay"
          // Use mousedown (not click) and require the press to ORIGINATE on the
          // overlay itself — otherwise a trim drag that started inside the modal
          // and was released over the overlay would close the dialog.
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="montage-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="montage-modal-header">
              <span className="montage-modal-title">Trim sources — {fmtTime(totalDuration)}s output</span>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="montage-modal-body">
              {renderTimeline(true)}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Shared scrub decoder — hidden video that any drag (inline or modal) seeks
          into. Always mounted so the first drag has a warm element.
          The video has real dimensions (64×36, in viewport, opacity 1) inside a
          1×1 overflow:hidden clip so the compositor genuinely paints it on
          every seek — without this, Chrome can skip presentation for tiny
          offscreen videos and `requestVideoFrameCallback` never fires. */}
      <div
        aria-hidden="true"
        style={{ position: "fixed", bottom: 0, right: 0, width: 1, height: 1, overflow: "hidden", pointerEvents: "none", zIndex: -1 }}
      >
        <video
          ref={seekVideoRef}
          muted
          playsInline
          preload="auto"
          crossOrigin="anonymous"
          style={{ width: 64, height: 36, display: "block" }}
        />
      </div>

      {/* Floating frame thumbnail at the cursor while a trim handle is being dragged */}
      {scrubTip && createPortal(
        (() => {
          const W = 240;
          const H = 135; // initial estimate; canvas resizes itself after first frame
          const margin = 12;
          let left = scrubTip.x - W / 2;
          let top = scrubTip.y - H - margin;
          if (left < margin) left = margin;
          if (left + W > window.innerWidth - margin) left = window.innerWidth - W - margin;
          if (top < margin) top = scrubTip.y + margin;
          return (
            <div className="montage-scrub-tooltip" style={{ left, top, width: W }}>
              <canvas ref={seekCanvasRef} />
              <div className="montage-scrub-time">
                C{scrubTip.clipIndex + 1} · {fmtTime(scrubTip.time)}s
              </div>
            </div>
          );
        })(),
        document.body,
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
