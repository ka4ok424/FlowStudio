import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Auto-shrink fontSize so the text fits its container.
 *
 * Returns `[effFont, ref, didFit]`:
 * - effFont — fontSize to apply (≥ min, ≤ configured)
 * - ref — attach to the element whose scrollHeight reflects text overflow
 *   (textarea while editing, the text div in view mode)
 * - didFit — false only when even at `min` the text still overflows; the
 *   caller can use this to switch alignment (e.g. top-align so the first line
 *   is visible).
 *
 * Re-measures synchronously on every render of the host component AND on
 * container resize via ResizeObserver. Single-pass linear search via temporary
 * DOM mutation — no React state-loop, so it converges immediately on each
 * keystroke.
 */
export function useFitFontSize<T extends HTMLElement = HTMLElement>(
  configured: number,
  deps: any[] = [],
  min = 8,
) {
  const ref = useRef<T | null>(null);
  const [eff, setEff] = useState(configured);
  const [didFit, setDidFit] = useState(true);
  const [tick, setTick] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const orig = el.style.fontSize;
    let candidate = Math.max(min, configured);
    el.style.fontSize = `${candidate}px`;
    let fits =
      el.scrollHeight <= el.clientHeight + 1 &&
      el.scrollWidth <= el.clientWidth + 1;
    while (!fits && candidate > min) {
      candidate -= 1;
      el.style.fontSize = `${candidate}px`;
      fits =
        el.scrollHeight <= el.clientHeight + 1 &&
        el.scrollWidth <= el.clientWidth + 1;
    }
    el.style.fontSize = orig; // restore React-managed style

    setEff((prev) => (prev === candidate ? prev : candidate));
    setDidFit((prev) => (prev === fits ? prev : fits));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, tick, ...deps]);

  // Re-trigger fit on container resize (sticker S/M/L or manual resize)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [eff, ref, didFit] as const;
}
