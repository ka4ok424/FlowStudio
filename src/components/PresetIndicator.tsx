import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Preset = "PHOTO" | "VIDEO" | "OTHER" | "OFFLINE";

interface State {
  preset: Preset;
  argv: string[];
}

/** PHOTO = no --highvram + no --cache-lru.
 *  VIDEO = --highvram AND --cache-lru. Anything else = OTHER. */
function detectPreset(argv: string[]): Preset {
  if (!argv.length) return "OFFLINE";
  const has = (flag: string) => argv.some((a) => a === flag || a.startsWith(flag + "="));
  const hi = has("--highvram");
  const cl = has("--cache-lru");
  if (hi && cl) return "VIDEO";
  if (!hi && !cl) return "PHOTO";
  return "OTHER";
}

/** Strip boilerplate, keep only meaningful flags. Pair `--flag value` on one line. */
function meaningfulFlags(argv: string[]): string[] {
  const skip = new Set([
    "main.py", "--listen", "0.0.0.0", "--port", "8188",
    "--enable-cors-header", "*",
  ]);
  const filtered = argv.filter((a) => !skip.has(a));
  // Combine `--flag` with its value (next non-flag token)
  const lines: string[] = [];
  for (let i = 0; i < filtered.length; i++) {
    const a = filtered[i];
    if (a.startsWith("--") && i + 1 < filtered.length && !filtered[i + 1].startsWith("--")) {
      lines.push(`${a} ${filtered[i + 1]}`);
      i++;
    } else {
      lines.push(a);
    }
  }
  return lines;
}

const ICON: Record<Preset, string> = {
  PHOTO: "📷", VIDEO: "🎥", OTHER: "⚙", OFFLINE: "·",
};
const COLOR: Record<Preset, string> = {
  PHOTO: "#3b82f6", VIDEO: "#e85d75", OTHER: "#f5a524", OFFLINE: "#666",
};

const HOVER_DELAY_MS = 150;

export default function PresetIndicator() {
  const [state, setState] = useState<State>({ preset: "OFFLINE", argv: [] });
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const hoverTimer = useRef<number>(0);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Poll system_stats every 4s
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const r = await fetch("/api/system_stats");
        if (!r.ok) throw new Error(String(r.status));
        const d = await r.json();
        if (cancelled) return;
        const argv: string[] = d.system?.argv || [];
        setState({ preset: detectPreset(argv), argv });
      } catch {
        if (!cancelled) setState({ preset: "OFFLINE", argv: [] });
      }
    };
    pull();
    const h = setInterval(pull, 4000);
    return () => { cancelled = true; clearInterval(h); };
  }, []);

  const onEnter = () => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (r) setTooltipPos({ x: r.left, y: r.bottom + 6 });
    }, HOVER_DELAY_MS);
  };
  const onLeave = () => {
    clearTimeout(hoverTimer.current);
    setTooltipPos(null);
  };

  const flags = meaningfulFlags(state.argv);

  return (
    <>
      <button
        ref={buttonRef}
        className="btn-settings"
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        style={{
          cursor: "help",
          color: COLOR[state.preset],
          borderColor: COLOR[state.preset] + "55",
        }}
      >
        {ICON[state.preset]}
      </button>
      {tooltipPos && createPortal(
        <div
          className="fs-tooltip"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
            width: "auto",
            maxWidth: 560,
            whiteSpace: "pre",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 11,
            lineHeight: 1.5,
          }}
        >
          {state.preset === "OFFLINE"
            ? "ComfyUI offline"
            : `Preset: ${state.preset}\n\n${flags.join("\n")}`}
        </div>,
        document.body,
      )}
    </>
  );
}
