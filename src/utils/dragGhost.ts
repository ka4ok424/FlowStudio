/**
 * Creates a fixed-size thumbnail canvas to use as setDragImage target.
 * Bypasses CSS transforms (React Flow zoom) and natural image resolution —
 * the drag ghost is always the same pixel size on screen.
 *
 * Usage:
 *   const ghost = makeDragGhost(imgEl, 120);
 *   e.dataTransfer.setDragImage(ghost, offsetX, offsetY);
 */
export function makeDragGhost(
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  maxSize = 120,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  let nw = 0, nh = 0;
  if (source instanceof HTMLVideoElement) {
    nw = source.videoWidth; nh = source.videoHeight;
  } else if (source instanceof HTMLImageElement) {
    nw = source.naturalWidth; nh = source.naturalHeight;
  } else {
    nw = source.width; nh = source.height;
  }
  if (!nw || !nh) {
    canvas.width = maxSize;
    canvas.height = maxSize;
  } else {
    const scale = Math.min(maxSize / nw, maxSize / nh);
    canvas.width = Math.max(1, Math.round(nw * scale));
    canvas.height = Math.max(1, Math.round(nh * scale));
  }
  // Must be in DOM for the browser to snapshot it.
  canvas.style.position = "fixed";
  canvas.style.top = "-9999px";
  canvas.style.left = "-9999px";
  canvas.style.pointerEvents = "none";
  document.body.appendChild(canvas);
  try {
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  } catch {
    // Cross-origin video frames may throw — fall back to empty canvas
  }
  // Remove after the drag snapshot is taken. Browsers snapshot synchronously on
  // setDragImage, so 0 is fine; use 500 to be safe on edge cases.
  setTimeout(() => canvas.remove(), 500);
  return canvas;
}

/**
 * Finds the first <img>/<video>/<canvas> inside a container to use as ghost source.
 */
export function findGhostSource(container: HTMLElement): HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null {
  return container.querySelector("img, video, canvas") as any;
}
