import { useEffect, useRef } from "react";

/**
 * Hook: keep a <textarea> sized to its content.
 * Pass `value` as the dependency so it recomputes after each change.
 * Optional max in px — past that point a scrollbar appears (default 1200).
 */
export function useAutoGrowTextarea(value: string, maxPx = 600) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const desired = Math.min(maxPx, el.scrollHeight);
    el.style.height = `${desired}px`;
  }, [value, maxPx]);
  return ref;
}
