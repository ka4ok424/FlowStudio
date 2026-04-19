import { useEffect, useState } from "react";
import { log } from "../store/logStore";

interface Stats {
  vramTotal?: number;
  vramFree?: number;
  ramTotal: number;
  ramFree: number;
}

function fmtGB(b: number | undefined): string {
  if (b == null) return "—";
  return `${(b / 1024 ** 3).toFixed(1)} GB`;
}

/**
 * Compact two-line indicator for ComfyUI VRAM/RAM usage.
 * Lives top-right in the Toolbar. Polls /api/system_stats every 4 seconds.
 */
export default function SystemStatsIndicator() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [ok, setOk] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const r = await fetch("/api/system_stats");
        if (!r.ok) throw new Error(String(r.status));
        const d = await r.json();
        if (cancelled) return;
        const dev = (d.devices && d.devices[0]) || {};
        setStats({
          ramTotal: d.system?.ram_total || 0,
          ramFree: d.system?.ram_free || 0,
          vramTotal: dev.vram_total,
          vramFree: dev.vram_free,
        });
        setOk(true);
      } catch {
        if (!cancelled) setOk(false);
      }
    };
    pull();
    const h = setInterval(pull, 4000);
    return () => { cancelled = true; clearInterval(h); };
  }, []);

  const vramUsed = stats?.vramTotal != null && stats?.vramFree != null
    ? stats.vramTotal - stats.vramFree : null;
  const ramUsed = stats != null ? stats.ramTotal - stats.ramFree : null;
  const vramPct = stats?.vramTotal ? Math.round(100 * (vramUsed! / stats.vramTotal)) : null;
  const ramPct = stats?.ramTotal ? Math.round(100 * (ramUsed! / stats.ramTotal)) : null;

  const [freeing, setFreeing] = useState(false);
  const freeVram = async () => {
    if (freeing) return;
    setFreeing(true);
    try {
      const r = await fetch("/api/free", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unload_models: true, free_memory: true }),
      });
      log(`Free VRAM ${r.ok ? "OK" : "failed"}`, { nodeType: "system", status: r.ok ? "success" : "error" });
    } catch (err: any) {
      log(`Free VRAM error: ${err.message}`, { nodeType: "system", status: "error" });
    }
    setFreeing(false);
  };

  return (
    <div
      title={ok ? `VRAM ${fmtGB(vramUsed ?? undefined)} / ${fmtGB(stats?.vramTotal)}\nRAM ${fmtGB(ramUsed ?? undefined)} / ${fmtGB(stats?.ramTotal)}\n\nMemory cached by ComfyUI on Windows PC.` : "ComfyUI offline"}
      style={{
        display: "grid",
        gridTemplateColumns: "32px 1fr",
        alignItems: "center",
        rowGap: 2,
        columnGap: 5,
        padding: "1px 4px",
        minWidth: 168,
        background: ok ? "transparent" : "rgba(239,83,80,0.08)",
      }}
    >
      <button
        onClick={freeVram}
        disabled={freeing || !ok}
        title="Unload models in ComfyUI to free VRAM"
        style={{
          gridColumn: "1 / -1",
          fontSize: 9,
          padding: "0 6px",
          height: 14,
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: 3,
          color: "#9098a8",
          cursor: freeing || !ok ? "default" : "pointer",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          letterSpacing: 0.3,
        }}
      >{freeing ? "freeing…" : "free VRAM"}</button>
      <BarCells label="VRAM" pct={vramPct} accent="#3b82f6" />
      <BarCells label="RAM"  pct={ramPct}  accent="#66bb6a" />
    </div>
  );
}

function BarCells({ label, pct, accent }: { label: string; pct: number | null | undefined; accent: string }) {
  const value = pct ?? 0;
  return (
    <>
      <span style={{
        color: "#9098a8", textAlign: "right", fontWeight: 600,
        fontSize: 9.5,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        lineHeight: 1.2,
      }}>{label}</span>
      <div style={{
        position: "relative",
        height: 13,
        borderRadius: 3,
        background: "rgba(255,255,255,0.06)",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${Math.min(100, Math.max(0, value))}%`,
          background: accent,
          opacity: 0.55,
          transition: "width 0.4s ease",
        }} />
        <span style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff",
          textShadow: "0 0 3px rgba(0,0,0,0.6)",
          fontWeight: 600,
          fontSize: 9.5,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}>{pct == null ? "—" : `${value}%`}</span>
      </div>
    </>
  );
}
