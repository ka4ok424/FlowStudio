import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface CellRect { x: number; y: number; w: number; h: number }

interface Props {
  srcUrl: string;
  srcDim: { w: number; h: number };
  initialCells: CellRect[];
  onChange: (cells: CellRect[]) => void;   // live, called on every modification
  onClose: () => void;
}

type Handle = "nw" | "ne" | "sw" | "se";

const MAX_CELLS = 32;
const MIN_CELL = 16;     // px, in source-space
const HISTORY_DEPTH = 2;
const HANDLE_HIT = 14;   // px in display-space — touch-friendly handle hit radius
const SNAP_PX = 4;       // display-space snap tolerance — small so it only catches at the last few pixels
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.1;

interface ARPreset { label: string; ratio: number | null }
const AR_PRESETS: ARPreset[] = [
  { label: "Free",  ratio: null },
  { label: "1:1",   ratio: 1 / 1 },
  { label: "4:5",   ratio: 4 / 5 },
  { label: "16:9",  ratio: 16 / 9 },
  { label: "9:16",  ratio: 9 / 16 },
];

/**
 * Fullscreen multi-crop editor.
 *
 * Single merged mode (no Place/Resize toggle):
 *   - No cells: drag on the canvas to draw the first rectangle.
 *   - Cells exist: click empty space → add cell of template size at click;
 *     drag a cell body → move it; drag a corner handle → resize it.
 *     Click on a cell selects it (handles appear on the selected cell).
 *
 * Aspect ratio toolbar:
 *   - Free / 1:1 / 4:5 / 16:9 / 9:16 — clicking a non-Free preset locks the
 *     ratio for all future drawing/resizing AND immediately snaps every
 *     existing cell to that ratio (keeping width, adjusting height; scaling
 *     down if it would overflow). Cell SIZE is not fixed — only the ratio.
 *
 * Live size readout: every cell shows its W×H badge; the value updates while
 * dragging so the user can hit a specific pixel size precisely.
 *
 * Undo: Cmd/Ctrl+Z restores the previous state (up to HISTORY_DEPTH).
 * Esc / backdrop click / Done — closes.
 */
export default function MultiCropEditor({ srcUrl, srcDim, initialCells, onChange, onClose }: Props) {
  const [cells, setCells] = useState<CellRect[]>(initialCells);
  const [selected, setSelected] = useState<number>(-1);
  const [history, setHistory] = useState<CellRect[][]>([]);
  const [aspectLock, setAspectLock] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [fitSize, setFitSize] = useState<{ w: number; h: number } | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ xs: number[]; ys: number[] }>({ xs: [], ys: [] });

  // Active drag — what's happening this gesture.
  const dragRef = useRef<
    | { type: "draw"; startX: number; startY: number; curX: number; curY: number }
    | { type: "move"; idx: number; startCell: CellRect; startMouseX: number; startMouseY: number; moved: boolean }
    | { type: "resize"; idx: number; handle: Handle; startCell: CellRect; startMouseX: number; startMouseY: number }
    | null
  >(null);
  const [drawPreview, setDrawPreview] = useState<CellRect | null>(null);
  const [activeDragIdx, setActiveDragIdx] = useState<number>(-1); // for highlighting cell being moved/resized

  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  const aspectLockRef = useRef(aspectLock);
  aspectLockRef.current = aspectLock;

  const canvasRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [, forceTick] = useState(0);

  const getDisplayRect = useCallback((): DOMRect | null => {
    return imgRef.current ? imgRef.current.getBoundingClientRect() : null;
  }, []);
  const dispToSrc = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const r = getDisplayRect();
    if (!r || r.width === 0 || r.height === 0) return null;
    const sx = srcDim.w / r.width;
    const sy = srcDim.h / r.height;
    return { x: (clientX - r.left) * sx, y: (clientY - r.top) * sy };
  }, [getDisplayRect, srcDim.w, srcDim.h]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete) { forceTick((n) => n + 1); return; }
    const onLoad = () => forceTick((n) => n + 1);
    img.addEventListener("load", onLoad);
    return () => img.removeEventListener("load", onLoad);
  }, [srcUrl]);
  useEffect(() => {
    const onResize = () => forceTick((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Measure the image's natural-fit displayed size when zoom === 1. This is
  // the "100%" reference — for any zoom > 1 we apply explicit pixel
  // dimensions = fitSize × zoom so even tiny source images can be magnified
  // beyond their natural pixel size (the previous max-width/height multiplier
  // approach was a no-op when natural size was smaller than the viewport cap).
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (zoom !== 1) return;
    const measure = () => {
      const r = img.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setFitSize({ w: r.width, h: r.height });
      }
    };
    if (img.complete) {
      // Defer one frame so layout settles after any prior zoom change.
      requestAnimationFrame(measure);
    } else {
      img.addEventListener("load", measure, { once: true });
      return () => img.removeEventListener("load", measure);
    }
  }, [zoom, srcUrl]);

  // Re-measure on viewport resize while at zoom=1.
  useEffect(() => {
    if (zoom !== 1) return;
    const onR = () => {
      const img = imgRef.current;
      if (!img) return;
      const r = img.getBoundingClientRect();
      if (r.width > 0) setFitSize({ w: r.width, h: r.height });
    };
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, [zoom]);

  // Wheel-zoom on the canvas — matches xyflow node-area UX. Native listener
  // with passive:false so we can preventDefault to stop the page from scrolling.
  // Pivots around cursor: keep the source-pixel under the mouse pinned.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const oldZoom = zoom;
      const dir = e.deltaY < 0 ? 1 : -1;
      // Smooth multiplicative steps; clamp.
      const factor = dir > 0 ? 1.12 : 1 / 1.12;
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, +(oldZoom * factor).toFixed(3)));
      if (newZoom === oldZoom) return;

      // Pivot: keep the pixel under the cursor stationary.
      const img = imgRef.current;
      if (img) {
        const r = img.getBoundingClientRect();
        const focusX = e.clientX - r.left;   // px inside the image
        const focusY = e.clientY - r.top;
        const ratio = newZoom / oldZoom;
        const scrollDX = focusX * (ratio - 1);
        const scrollDY = focusY * (ratio - 1);
        // Apply zoom, then adjust scroll on next frame after layout updates.
        setZoom(newZoom);
        requestAnimationFrame(() => {
          if (wrap) {
            wrap.scrollLeft += scrollDX;
            wrap.scrollTop  += scrollDY;
          }
        });
      } else {
        setZoom(newZoom);
      }
    };
    wrap.addEventListener("wheel", handler, { passive: false });
    return () => wrap.removeEventListener("wheel", handler);
  }, [zoom]);

  // ── History ─────────────────────────────────────────────────────────────
  const pushHistory = useCallback(() => {
    setHistory((h) => {
      const snap = cellsRef.current.map((c) => ({ ...c }));
      const upd = [...h, snap];
      return upd.length > HISTORY_DEPTH ? upd.slice(-HISTORY_DEPTH) : upd;
    });
  }, []);
  const commit = useCallback((next: CellRect[], snapshot = true) => {
    if (snapshot) pushHistory();
    setCells(next);
    onChange(next);
  }, [onChange, pushHistory]);
  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setCells(prev);
      onChange(prev);
      return h.slice(0, -1);
    });
  }, [onChange]);
  const clearAll = useCallback(() => {
    if (cellsRef.current.length === 0) return;
    commit([]);
    setSelected(-1);
  }, [commit]);
  const removeCell = useCallback((idx: number) => {
    const next = cellsRef.current.filter((_, i) => i !== idx);
    commit(next);
    setSelected(-1);
  }, [commit]);

  // ── Geometry helpers ────────────────────────────────────────────────────
  const clamp = useCallback((c: CellRect): CellRect => {
    const w = Math.max(MIN_CELL, Math.min(srcDim.w, c.w));
    const h = Math.max(MIN_CELL, Math.min(srcDim.h, c.h));
    const x = Math.max(0, Math.min(srcDim.w - w, c.x));
    const y = Math.max(0, Math.min(srcDim.h - h, c.y));
    return { x, y, w, h };
  }, [srcDim.w, srcDim.h]);

  /** Snap a cell to a target aspect ratio, keeping its width if possible. */
  const snapToAR = useCallback((c: CellRect, ratio: number): CellRect => {
    let w = c.w;
    let h = w / ratio;
    if (h > srcDim.h) {
      h = srcDim.h;
      w = h * ratio;
    }
    if (w > srcDim.w) {
      w = srcDim.w;
      h = w / ratio;
    }
    // Anchor by center
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    return clamp({ x: cx - w / 2, y: cy - h / 2, w, h });
  }, [clamp, srcDim.h, srcDim.w]);

  /** Template W from most recent cell — H derives from aspect if locked. */
  const effectiveTemplate = useMemo((): { w: number; h: number } | null => {
    if (cells.length === 0) return null;
    const last = cells[cells.length - 1];
    if (aspectLock != null) {
      // Force template to honor the lock too, in case user toggled lock later.
      let w = last.w;
      let h = w / aspectLock;
      if (h > srcDim.h) { h = srcDim.h; w = h * aspectLock; }
      if (w > srcDim.w) { w = srcDim.w; h = w / aspectLock; }
      return { w, h };
    }
    return { w: last.w, h: last.h };
  }, [cells, aspectLock, srcDim.w, srcDim.h]);

  // ── AR preset click ─────────────────────────────────────────────────────
  const onPickAR = useCallback((ratio: number | null) => {
    setAspectLock(ratio);
    if (ratio == null) return;
    // Snap all existing cells to the new ratio.
    if (cellsRef.current.length === 0) return;
    pushHistory();
    const next = cellsRef.current.map((c) => snapToAR(c, ratio));
    setCells(next);
    onChange(next);
  }, [pushHistory, snapToAR, onChange]);

  // ── Hit testing ─────────────────────────────────────────────────────────
  const hitTestCell = useCallback((srcX: number, srcY: number): number => {
    for (let i = cellsRef.current.length - 1; i >= 0; i--) {
      const c = cellsRef.current[i];
      if (srcX >= c.x && srcX <= c.x + c.w && srcY >= c.y && srcY <= c.y + c.h) return i;
    }
    return -1;
  }, []);
  const hitTestHandle = useCallback((srcX: number, srcY: number, idx: number): Handle | null => {
    const c = cellsRef.current[idx];
    if (!c) return null;
    const r = getDisplayRect();
    if (!r) return null;
    const sx = srcDim.w / r.width;
    const tol = HANDLE_HIT * sx;
    const corners: Array<[Handle, number, number]> = [
      ["nw", c.x,         c.y],
      ["ne", c.x + c.w,   c.y],
      ["sw", c.x,         c.y + c.h],
      ["se", c.x + c.w,   c.y + c.h],
    ];
    for (const [h, hx, hy] of corners) {
      if (Math.abs(srcX - hx) <= tol && Math.abs(srcY - hy) <= tol) return h;
    }
    return null;
  }, [getDisplayRect, srcDim.w]);

  // ── Pointer interactions ────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = dispToSrc(e.clientX, e.clientY);
    if (!p) return;

    // 1. If a cell is selected, try corner handles first (highest priority).
    if (selected >= 0) {
      const h = hitTestHandle(p.x, p.y, selected);
      if (h) {
        dragRef.current = {
          type: "resize",
          idx: selected,
          handle: h,
          startCell: { ...cellsRef.current[selected] },
          startMouseX: e.clientX,
          startMouseY: e.clientY,
        };
        setActiveDragIdx(selected);
        (e.target as Element).setPointerCapture?.(e.pointerId);
        return;
      }
    }

    // 2. If clicked inside an existing cell → select + start move drag.
    const hit = hitTestCell(p.x, p.y);
    if (hit >= 0) {
      setSelected(hit);
      dragRef.current = {
        type: "move",
        idx: hit,
        startCell: { ...cellsRef.current[hit] },
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        moved: false,
      };
      setActiveDragIdx(hit);
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }

    // 3. Clicked on empty space.
    if (cellsRef.current.length === 0) {
      // No cells yet → drag to draw the first rectangle.
      dragRef.current = { type: "draw", startX: p.x, startY: p.y, curX: p.x, curY: p.y };
      setDrawPreview(null);
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    // Already have cells → empty-space click = add cell of template size.
    if (!effectiveTemplate) return;
    if (cellsRef.current.length >= MAX_CELLS) return;
    const w = effectiveTemplate.w;
    const h = effectiveTemplate.h;
    const newCell = clamp({ x: p.x - w / 2, y: p.y - h / 2, w, h });
    const next = [...cellsRef.current, newCell];
    commit(next);
    setSelected(next.length - 1);
  }, [selected, dispToSrc, hitTestCell, hitTestHandle, effectiveTemplate, clamp, commit]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = dispToSrc(e.clientX, e.clientY);
    if (!p) return;
    const r = getDisplayRect();
    if (!r) return;
    const sx = srcDim.w / r.width;
    const sy = srcDim.h / r.height;
    const ar = aspectLockRef.current;

    if (d.type === "draw") {
      d.curX = p.x; d.curY = p.y;
      let x = Math.min(d.startX, d.curX);
      let y = Math.min(d.startY, d.curY);
      let w = Math.abs(d.curX - d.startX);
      let h = Math.abs(d.curY - d.startY);
      if (ar != null && w > 0 && h > 0) {
        // Use the side with larger drag distance to drive the other.
        if (w / h > ar) {
          // wider than ar → narrow it
          const newW = h * ar;
          if (d.curX < d.startX) x = d.startX - newW;
          w = newW;
        } else {
          const newH = w / ar;
          if (d.curY < d.startY) y = d.startY - newH;
          h = newH;
        }
      }
      setDrawPreview(clamp({ x, y, w, h }));
      return;
    }

    if (d.type === "move") {
      const dx = (e.clientX - d.startMouseX) * sx;
      const dy = (e.clientY - d.startMouseY) * sy;
      if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true;
      let proposed = clamp({ x: d.startCell.x + dx, y: d.startCell.y + dy, w: d.startCell.w, h: d.startCell.h });

      // Snap-to-align — find the closest matching edge of any other cell.
      const snapTolX = SNAP_PX * sx;
      const snapTolY = SNAP_PX * sy;
      const others = cellsRef.current.filter((_, i) => i !== d.idx);
      if (others.length > 0) {
        const myXs = [proposed.x, proposed.x + proposed.w, proposed.x + proposed.w / 2];
        const myYs = [proposed.y, proposed.y + proposed.h, proposed.y + proposed.h / 2];
        const otherXs: number[] = [];
        const otherYs: number[] = [];
        for (const o of others) {
          otherXs.push(o.x, o.x + o.w, o.x + o.w / 2);
          otherYs.push(o.y, o.y + o.h, o.y + o.h / 2);
        }
        let bestDX: number | null = null, bestX: number | null = null;
        for (const my of myXs) for (const ox of otherXs) {
          const dd = ox - my;
          if (Math.abs(dd) <= snapTolX && (bestDX == null || Math.abs(dd) < Math.abs(bestDX))) {
            bestDX = dd; bestX = ox;
          }
        }
        let bestDY: number | null = null, bestY: number | null = null;
        for (const my of myYs) for (const oy of otherYs) {
          const dd = oy - my;
          if (Math.abs(dd) <= snapTolY && (bestDY == null || Math.abs(dd) < Math.abs(bestDY))) {
            bestDY = dd; bestY = oy;
          }
        }
        if (bestDX != null) proposed = { ...proposed, x: proposed.x + bestDX };
        if (bestDY != null) proposed = { ...proposed, y: proposed.y + bestDY };
        proposed = clamp(proposed);
        setSnapGuides({
          xs: bestX != null ? [bestX] : [],
          ys: bestY != null ? [bestY] : [],
        });
      } else {
        setSnapGuides({ xs: [], ys: [] });
      }

      if (d.moved && !(d as any)._historyPushed) {
        pushHistory();
        (d as any)._historyPushed = true;
      }
      const next = cellsRef.current.map((c, i) => i === d.idx ? proposed : c);
      setCells(next);
      onChange(next);
      return;
    }

    if (d.type === "resize") {
      const c = d.startCell;
      const dx = (e.clientX - d.startMouseX) * sx;
      const dy = (e.clientY - d.startMouseY) * sy;

      // Anchor = the OPPOSITE corner that must stay fixed.
      const ax = (d.handle === "nw" || d.handle === "sw") ? c.x + c.w : c.x;
      const ay = (d.handle === "nw" || d.handle === "ne") ? c.y + c.h : c.y;

      // Tentative new dimensions from raw mouse delta.
      let nw =
        d.handle === "nw" || d.handle === "sw" ? c.w - dx : c.w + dx;
      let nh =
        d.handle === "nw" || d.handle === "ne" ? c.h - dy : c.h + dy;

      // AR lock — pick the driving axis by larger user motion.
      if (ar != null) {
        if (Math.abs(dx) > Math.abs(dy) * ar) {
          nh = nw / ar;       // width-driven
        } else {
          nw = nh * ar;       // height-driven
        }
      }

      // Available space from anchor to nearest image boundary in this drag
      // direction. Shrink-to-fit if we'd push past it (keeps AR intact).
      const goesRight = ax === c.x;                                  // dragging E side
      const goesDown  = ay === c.y;                                  // dragging S side
      const availW = goesRight ? srcDim.w - ax : ax;
      const availH = goesDown  ? srcDim.h - ay : ay;
      let scale = 1;
      if (nw > availW) scale = Math.min(scale, availW / nw);
      if (nh > availH) scale = Math.min(scale, availH / nh);
      if (scale < 1) { nw *= scale; nh *= scale; }

      // Lower bound; keep AR when shrunk to floor.
      if (nw < MIN_CELL) {
        nw = MIN_CELL;
        if (ar != null) nh = nw / ar;
      }
      if (nh < MIN_CELL) {
        nh = MIN_CELL;
        if (ar != null) nw = nh * ar;
      }

      // Position from anchor — keeps the diagonally-opposite corner pinned.
      let nx = goesRight ? ax : ax - nw;
      let ny = goesDown  ? ay : ay - nh;

      // Light snap-to-align on the MOVING corner — only when AR is unlocked
      // (with AR locked, snapping one side forces the other out of ratio).
      // Snap targets: other cells' edges + image boundaries (0, srcDim.w/h).
      const snapTolX2 = SNAP_PX * sx;
      const snapTolY2 = SNAP_PX * sy;
      const othersR = cellsRef.current.filter((_, i) => i !== d.idx);
      const guideX: number[] = [], guideY: number[] = [];
      if (ar == null && othersR.length > 0) {
        const movingX = goesRight ? nx + nw : nx;
        const movingY = goesDown  ? ny + nh : ny;
        const targetsX: number[] = [];
        const targetsY: number[] = [];
        for (const o of othersR) {
          targetsX.push(o.x, o.x + o.w, o.x + o.w / 2);
          targetsY.push(o.y, o.y + o.h, o.y + o.h / 2);
        }
        let bestDX2: number | null = null, snapX2: number | null = null;
        for (const tx of targetsX) {
          const dd = tx - movingX;
          if (Math.abs(dd) <= snapTolX2 && (bestDX2 == null || Math.abs(dd) < Math.abs(bestDX2))) {
            bestDX2 = dd; snapX2 = tx;
          }
        }
        let bestDY2: number | null = null, snapY2: number | null = null;
        for (const ty of targetsY) {
          const dd = ty - movingY;
          if (Math.abs(dd) <= snapTolY2 && (bestDY2 == null || Math.abs(dd) < Math.abs(bestDY2))) {
            bestDY2 = dd; snapY2 = ty;
          }
        }
        if (snapX2 != null) {
          if (goesRight) { nw = snapX2 - ax; }
          else           { nw = ax - snapX2; nx = snapX2; }
          guideX.push(snapX2);
        }
        if (snapY2 != null) {
          if (goesDown) { nh = snapY2 - ay; }
          else          { nh = ay - snapY2; ny = snapY2; }
          guideY.push(snapY2);
        }
        // Re-validate MIN_CELL after snap.
        if (nw < MIN_CELL) { nw = MIN_CELL; nx = goesRight ? ax : ax - nw; }
        if (nh < MIN_CELL) { nh = MIN_CELL; ny = goesDown  ? ay : ay - nh; }
      }
      setSnapGuides({ xs: guideX, ys: guideY });

      const updated = clamp({ x: nx, y: ny, w: nw, h: nh });
      if (!(d as any)._historyPushed) {
        pushHistory();
        (d as any)._historyPushed = true;
      }
      const next = cellsRef.current.map((cc, i) => i === d.idx ? updated : cc);
      setCells(next);
      onChange(next);
      return;
    }
  }, [dispToSrc, getDisplayRect, srcDim.w, srcDim.h, clamp, onChange, pushHistory]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    setSnapGuides({ xs: [], ys: [] });

    if (d.type === "draw") {
      const r = drawPreview;
      setDrawPreview(null);
      dragRef.current = null;
      setActiveDragIdx(-1);
      if (r && r.w >= MIN_CELL && r.h >= MIN_CELL) {
        commit([r]);
        setSelected(0);
      }
      return;
    }
    dragRef.current = null;
    setActiveDragIdx(-1);
  }, [drawPreview, commit]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    // Capture phase so we run BEFORE xyflow's canvas-level keydown handler,
    // which otherwise treats Del/Backspace as "delete the selected node on the
    // canvas" — including this MultiCrop node itself.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.stopPropagation();
        undo();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        // ALWAYS swallow Del/Backspace while the editor is open. If a cell is
        // selected, remove it; otherwise it's a no-op — but in either case
        // xyflow must NOT see the event (would delete this node from the canvas).
        e.preventDefault();
        e.stopPropagation();
        if (selected >= 0) removeCell(selected);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, undo, removeCell, selected]);

  // ── Render ──────────────────────────────────────────────────────────────
  const dispR = getDisplayRect();
  const imgW = dispR?.width || 0;
  const imgH = dispR?.height || 0;
  const toPct = (val: number, total: number) => (total > 0 ? `${(val / total) * 100}%` : "0");

  const renderCell = (c: CellRect, i: number) => {
    const isSel = selected === i;
    const isDragging = activeDragIdx === i;
    return (
      <div
        key={i}
        className={`mc-cell ${isSel ? "selected" : ""} ${isDragging ? "dragging" : ""}`}
        style={{
          left: toPct(c.x, srcDim.w),
          top: toPct(c.y, srcDim.h),
          width: toPct(c.w, srcDim.w),
          height: toPct(c.h, srcDim.h),
        }}
      >
        <span className="mc-cell-num">{i + 1}</span>
        <span className="mc-cell-size">{Math.round(c.w)}×{Math.round(c.h)}</span>
        <button
          className="mc-cell-delete"
          onPointerDown={(e) => { e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); removeCell(i); }}
          title="Delete cell"
        >×</button>
        {isSel && (
          <>
            <span className="mc-cell-handle nw" />
            <span className="mc-cell-handle ne" />
            <span className="mc-cell-handle sw" />
            <span className="mc-cell-handle se" />
          </>
        )}
      </div>
    );
  };

  const modal = (
    <div className="mc-editor-backdrop" onClick={onClose}>
      <div className="mc-editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mc-editor-toolbar">
          <div className="mc-tb-group" title="Aspect ratio lock">
            {AR_PRESETS.map((p) => {
              const isActive = (p.ratio == null && aspectLock == null) || (p.ratio != null && aspectLock === p.ratio);
              return (
                <button
                  key={p.label}
                  className={`mc-tb-btn ar ${isActive ? "active" : ""}`}
                  onClick={() => onPickAR(p.ratio)}
                  title={p.ratio == null ? "Free ratio" : `Lock to ${p.label} and snap existing cells`}
                >{p.label}</button>
              );
            })}
          </div>
          <div className="mc-tb-group">
            <button className="mc-tb-btn" onClick={undo} disabled={history.length === 0} title="Undo (Cmd/Ctrl+Z)">
              ↶ Undo
            </button>
            <button className="mc-tb-btn" onClick={clearAll} disabled={cells.length === 0} title="Clear all cells">
              ⌫ Clear
            </button>
          </div>
          <div className="mc-tb-group mc-tb-zoom" title="Zoom — or scroll wheel on the image">
            <button
              type="button"
              className="mc-tb-btn small"
              onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.max(ZOOM_MIN, +(z - 0.2).toFixed(2))); }}
              title="Zoom out (−20%)"
            >−</button>
            <input
              type="range"
              className="mc-zoom-slider"
              min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              title={`Zoom ${Math.round(zoom * 100)}%`}
            />
            <button
              type="button"
              className="mc-tb-btn small"
              onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.min(ZOOM_MAX, +(z + 0.2).toFixed(2))); }}
              title="Zoom in (+20%)"
            >+</button>
            <span className="mc-zoom-pct">{Math.round(zoom * 100)}%</span>
            {zoom !== 1 && (
              <button
                type="button"
                className="mc-tb-btn small ghost"
                onClick={(e) => { e.stopPropagation(); setZoom(1); }}
                title="Reset zoom (1×)"
              >1×</button>
            )}
          </div>
          <div className="mc-tb-counter">
            {cells.length} / {MAX_CELLS} {cells.length === 1 ? "cell" : "cells"}
            {effectiveTemplate && cells.length > 0 && (
              <span className="mc-tb-template"> · template {Math.round(effectiveTemplate.w)}×{Math.round(effectiveTemplate.h)}</span>
            )}
          </div>
          <button className="mc-tb-done" onClick={onClose}>Done ✓</button>
        </div>

        <div ref={wrapRef} className="mc-editor-canvas-wrap">
          <div
            ref={canvasRef}
            className="mc-editor-canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <img
              ref={imgRef}
              src={srcUrl}
              alt=""
              className="mc-editor-img"
              draggable={false}
              crossOrigin="anonymous"
              style={
                zoom !== 1 && fitSize
                  ? {
                      // Explicit dimensions force a target render size even when
                      // the natural pixels are smaller than the viewport cap.
                      width:  `${fitSize.w * zoom}px`,
                      height: `${fitSize.h * zoom}px`,
                      maxWidth: "none",
                      maxHeight: "none",
                    }
                  : undefined
              }
            />
            {imgW > 0 && imgH > 0 && (
              <>
                {cells.map(renderCell)}
                {drawPreview && (
                  <div className="mc-cell drawing" style={{
                    left: toPct(drawPreview.x, srcDim.w),
                    top: toPct(drawPreview.y, srcDim.h),
                    width: toPct(drawPreview.w, srcDim.w),
                    height: toPct(drawPreview.h, srcDim.h),
                  }}>
                    <span className="mc-cell-size big">{Math.round(drawPreview.w)}×{Math.round(drawPreview.h)}</span>
                  </div>
                )}
                {/* Snap guides — vertical and horizontal yellow lines spanning the canvas
                    along the snapped edge of the moved cell, matched with another cell's edge. */}
                {snapGuides.xs.map((sx, i) => (
                  <div key={`gx${i}`} className="mc-snap-guide vertical"   style={{ left: toPct(sx, srcDim.w) }} />
                ))}
                {snapGuides.ys.map((sy, i) => (
                  <div key={`gy${i}`} className="mc-snap-guide horizontal" style={{ top:  toPct(sy, srcDim.h) }} />
                ))}
              </>
            )}
          </div>
        </div>

        <div className="mc-editor-hint">
          {cells.length === 0
            ? "Drag on the image to draw the first cell."
            : "Click empty space to add a cell · drag a cell body to move · drag a corner handle to resize · × deletes"}
          {aspectLock != null && <span className="mc-hint-lock"> · 🔒 AR locked</span>}
          {" · "}<kbd>Esc</kbd> close · <kbd>⌘/Ctrl+Z</kbd> undo · <kbd>Del</kbd> remove · scroll wheel zooms
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
