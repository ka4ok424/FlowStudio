import { useEffect, useRef, useState, type ReactNode } from "react";
import WaveSurfer from "wavesurfer.js";

interface WaveformPlayerProps {
  url: string;
  accentColor?: string;
  rightSlot?: ReactNode;
}

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function WaveformPlayer({ url, accentColor = "#ec4899", rightSlot }: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    setReady(false);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    const ws = WaveSurfer.create({
      container: containerRef.current,
      url,
      height: 36,
      barWidth: 2,
      barGap: 2,
      barRadius: 1,
      barHeight: 1,
      cursorWidth: 1,
      cursorColor: accentColor,
      waveColor: "#4a4a52",
      progressColor: accentColor,
      normalize: false,
      interact: true,
      autoplay: false,
    });

    wsRef.current = ws;

    const onReady = () => { setReady(true); setDuration(ws.getDuration()); };
    const onTime = (t: number) => setCurrentTime(t);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onFinish = () => setPlaying(false);

    ws.on("ready", onReady);
    ws.on("audioprocess", onTime);
    ws.on("seeking", onTime);
    ws.on("play", onPlay);
    ws.on("pause", onPause);
    ws.on("finish", onFinish);

    return () => {
      try { ws.destroy(); } catch { /* noop */ }
      wsRef.current = null;
    };
  }, [url, accentColor]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    wsRef.current?.playPause();
  };

  return (
    <div className="wf-player nodrag" onClick={(e) => e.stopPropagation()}>
      <div ref={containerRef} className="wf-canvas" />
      <div className="wf-controls">
        <span className="wf-time">{fmt(currentTime)} / {fmt(duration)}</span>
        <button
          className="wf-play-btn"
          onClick={togglePlay}
          disabled={!ready}
          style={{ color: accentColor }}
          title={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        {rightSlot ? <div className="wf-right-slot">{rightSlot}</div> : null}
      </div>
    </div>
  );
}
