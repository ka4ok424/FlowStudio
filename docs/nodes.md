# FlowStudio Native Nodes — Technical Documentation

> **FOR AI AGENTS ONLY** — This document is the source of truth for AI assistants
> building workflows in FlowStudio. It describes every native node, its I/O,
> parameters, connection rules, and ComfyUI mapping.

---

## Architecture

FlowStudio uses a **hybrid node system** (Variant C):
- **Native nodes** (`fs:*`) — custom FlowStudio nodes with rich UI
- **ComfyUI nodes** — all 500+ nodes from ComfyUI, rendered as generic cards

Native nodes can:
1. Call external APIs directly (Nano Banana → Gemini API)
2. Build and send ComfyUI workflows internally (Local Gen → ComfyUI API)
3. Pass data to other nodes (Prompt → TEXT output)

### Connection Types — Canonical Color Map

> **MANDATORY RULE:** Every input/output Handle of a given type MUST use the exact
> color from this table. No exceptions. This ensures visual consistency across all
> nodes — a user must be able to identify the type by color alone.

| Type | Color | Handle `style={{ color }}` | Badge border/text |
|------|-------|---------------------------|-------------------|
| TEXT | `#f0c040` | `#f0c040` | `#f0c040` |
| IMAGE | `#64b5f6` | `#64b5f6` | `#64b5f6` |
| VIDEO | `#e85d75` | `#e85d75` | `#e85d75` |
| AUDIO | `#e8a040` | `#e8a040` | `#e8a040` |
| MEDIA | `#888888` | `#888888` | `#888888` |
| CHARACTER | `#a78bfa` | `#a78bfa` | `#a78bfa` |
| MODEL | `#b39ddb` | `#b39ddb` | `#b39ddb` |
| LATENT | `#ab47bc` | `#ab47bc` | `#ab47bc` |
| CONDITIONING | `#ef9a9a` | `#ef9a9a` | `#ef9a9a` |

**Badge format:** `<span style={{ color, borderColor: color+"66", backgroundColor: color+"12" }}>`

---

## fs:prompt — Prompt

**Purpose:** Universal text input for prompts, instructions, or any text data.

**Component:** `src/nodes/PromptNode.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Output | TEXT | text | The text content entered by the user |

**Parameters (widgetValues):**
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| text | string | "" | Free-form text, max 50,000 chars |

**Typical connections:**
- → `fs:nanoBanana.prompt` — image generation prompt
- → `fs:localGenerate.prompt` — local image generation prompt
- → `fs:agent.prompt` — AI agent instruction

**UI:** Textarea with auto-resize, character counter `N / 50,000`

---

## fs:nanoBanana — Nano Banana

**Purpose:** Cloud image generation via Google Gemini API.

**Component:** `src/nodes/NanoBananaNode.tsx`
**API:** `src/api/geminiApi.ts`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Text prompt for generation |
| Input | IMAGE | input_image | Image to edit (optional) |
| Input | IMAGE | ref_0..ref_13 | Reference images, dynamic (up to 14) |
| Output | IMAGE | image | Generated image |

**Parameters (widgetValues, configured in Properties Panel):**
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| model | string | "gemini-2.5-flash-image" | API model ID |
| aspectRatio | string | "1:1" | Output aspect ratio |
| seed | string | "" | Seed for reproducibility |
| temperature | number | 1.0 | Creativity (0-1) |
| numImages | number | 1 | Number of images (1-4) |
| safety_* | string | "BLOCK_MEDIUM_AND_ABOVE" | Safety filter level |
| _refCount | number | 1 | Current number of reference slots |

**Available models:**
- `gemini-2.5-flash-image` — Nano Banana (fast)
- `gemini-3.1-flash-image-preview` — Nano Banana 2 (better quality)
- `nano-banana-pro-preview` — Nano Banana Pro (best quality)

**API endpoint:** `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`

**Behavior:**
- Dynamic reference handles: starts with 1, user adds up to 14 via +/- buttons
- Generate button sends API request, shows result in preview
- Error displayed as red block on node
- Dice button randomizes seed

---

## fs:localGenerate — Local Generate

**Purpose:** Local image generation using ComfyUI backend with any installed checkpoint.

**Component:** `src/nodes/LocalGenerateNode.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Text prompt for generation |
| Output | IMAGE | image | Generated image |

**Parameters (widgetValues, configured in Properties Panel):**
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| model | string | first checkpoint | Checkpoint filename from ComfyUI |
| width | number | 720 | Output width (64-2048). Default = 9:16 portrait |
| height | number | 1280 | Output height (64-2048). Default = 9:16 portrait |
| steps | number | 4 | Sampling steps (1-50) |
| cfg | number | 7 | CFG scale (1-20) |
| seed | string | "" | Seed, random if empty |

**Aspect ratio presets (Properties panel buttons):**
- `1:1` — 1024 × 1024 (square)
- `4:5` — 1080 × 1350 (Instagram portrait)
- `16:9` — 1280 × 720 (landscape)
- `9:16` — 720 × 1280 (portrait, **default**)

**ComfyUI workflow built internally:**
```
CheckpointLoaderSimple (model)
  ├─ [MODEL] → KSampler
  ├─ [CLIP] → CLIPTextEncode (positive prompt)
  ├─ [CLIP] → CLIPTextEncode (negative, empty)
  └─ [VAE] → VAEDecode

EmptyLatentImage (width, height) → KSampler → VAEDecode → SaveImage
```

**Behavior:**
- Reads available checkpoints from ComfyUI API (`/api/object_info`)
- Sends workflow via `POST /api/prompt`
- Monitors progress via WebSocket
- Fetches result from `/api/history/{prompt_id}`
- Shows progress bar during generation

---

## fs:characterCard — Character Card

**Purpose:** Character profile card with portrait, description, and approve/reject flow. For building character databases for animation pipelines.

**Component:** `src/nodes/CharacterCardNode.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | ai_input | AI-generated character data (JSON or plain text) |
| Input | IMAGE | portrait_input | Portrait image from generator |
| Output | CHARACTER | character | Character data (name + description + portrait) |
| Output | IMAGE | portrait | Reference portrait for IP-Adapter |

**Parameters (widgetValues):**
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| name | string | "" | Character name |
| description | string | "" | Full character description (appearance, personality, traits) |
| portraitUrl | string | null | Reference portrait (data URL or blob URL) |
| status | string | "draft" | "draft", "approved", or "rejected" |

**AI Input format:**
- **JSON:** `{"name": "Masha", "description": "A 5-year-old girl with red pigtails..."}`
- **Plain text:** treated as description

**Behavior:**
- Approve/Reject buttons on the node for curating characters
- Visual status: green border (approved), red border (rejected), neutral (draft)
- Portrait accepts drag-and-drop from Media Library or file system
- Properties panel: full editing of name, description, status, portrait
- Output CHARACTER type feeds into Scene nodes for consistent generation
- Portrait output feeds into IP-Adapter for character consistency across scenes

**Typical connections:**
- `fs:prompt` → `ai_input` — manual character description
- `fs:nanoBanana` / `fs:localGenerate` → `portrait_input` — generated portrait
- `character` → `fs:scene` — character data for scene generation
- `portrait` → IP-Adapter nodes — reference image for consistency

---

## fs:scene — Scene

**Purpose:** Generate a scene with characters and background. Uses IP-Adapter for character consistency.

**Component:** `src/nodes/SceneNode.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | action | Scene action/description |
| Input | IMAGE | background | Optional background image |
| Input | CHARACTER | character_0..7 | Dynamic character slots (up to 8) |
| Output | IMAGE | scene | Generated scene image |

**Parameters (widgetValues):**
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| sceneTitle | string | "" | Scene title for storyboard |
| action | string | "" | Manual action text (overridden by connected prompt) |
| model | string | first checkpoint | Generation model |
| width | number | 1024 | Output width |
| height | number | 576 | Output height (16:9 default) |
| steps | number | 20 | Sampling steps |
| cfg | number | 7 | CFG scale |
| _characterCount | number | 1 | Number of character input slots |

**Behavior:**
- Reads character name/description/portrait from connected CharacterCard nodes
- Builds prompt from all character descriptions + action text
- For SD/SDXL: attempts IP-Adapter workflow using portraits as reference images
- Dynamic character slots: +/- buttons to add up to 8 characters
- Includes image history navigation (< 1/N >)

---

## fs:storyboard — Storyboard

**Purpose:** Visual timeline showing all scenes in sequence.

**Component:** `src/nodes/StoryboardNode.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Input | IMAGE | scene_0..19 | Dynamic scene slots (up to 20) |

**Parameters (widgetValues):**
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| title | string | "Storyboard" | Storyboard title |
| _sceneCount | number | 4 | Number of scene input slots |

**Behavior:**
- Shows 2-column grid of scene thumbnails
- Auto-reads _previewUrl from connected Scene nodes
- Numbered cells with scene titles
- Dynamic scene slots: +/- buttons up to 20

---

## fs:import — Import

**Purpose:** Import any media file (image, video, audio) with preview and file info.

**Component:** `src/nodes/ImportNode.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Output | MEDIA | media | Loaded media (type changes dynamically) |

**Parameters (widgetValues):**
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| _mediaType | string | "none" | "image", "video", "audio", or "none" |
| _fileName | string | "" | Original filename |
| _preview | string | null | Blob URL for preview |
| _fileInfo | object | {} | {resolution, size, format, duration, bitrate} |

**Output type behavior:**
- No file loaded: output type = MEDIA (gray, connects to anything)
- Image loaded: output type = IMAGE (blue)
- Video loaded: output type = VIDEO (pink)
- Audio loaded: output type = AUDIO (orange)

**Type validation:**
- When media type changes, connected edges are validated
- Incompatible connections turn red (`edge-error` class)
- Red handles appear on incompatible target inputs

**UI features:**
- Drag-and-drop or click to browse
- Audio: waveform visualization + custom player
- Video: embedded player with controls
- Image: auto-sizing preview
- Hover overlay: red ✕ delete button
- Properties panel: MEDIA INFO card with file details

---

## fs:frameExtract — Frame Extract

**Purpose:** Extract a single frame from a video as a lossless PNG image. Browser-side only — no PC/GPU work, no upload roundtrip. Defaults to the last frame.

**Component:** `src/nodes/FrameExtractNode.tsx`
**Properties:** `src/components/properties/FrameExtractProperties.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Input | VIDEO | video | Source video (from Import, VideoGen, LTX, Wan, Hunyuan, etc.) |
| Output | IMAGE | frame | Extracted frame at native resolution (PNG) |

**Parameters (widgetValues):**
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| frameIndex | int | -1 | Frame number to extract. **-1 = sentinel for "last frame"** (auto-recomputed when source changes). Manual values clamp to `[0, totalFrames-1]`. |
| _previewUrl | string | null | Output: blob URL of the extracted PNG frame (read by downstream nodes) |
| _extractedFrame | int \| null | null | Which frame index is currently materialized (for FRESH/PENDING badge) |
| _extractedSize | string | null | "<width> × <height>" of the extracted frame |
| _lastSourceUrl | string | null | Internal: tracks source URL to reset frameIndex on input change |

**Quality / extraction behavior:**
- Canvas drawn at `video.videoWidth × video.videoHeight` — **no resize, no scaling**
- Encoded via `canvas.toBlob('image/png')` — **lossless** (no JPEG)
- Stored as blob URL via `dataUrlToBlobUrl()` — keeps decoded image in native memory
- Frame seek uses `requestVideoFrameCallback` after `seeked` event for frame-accurate timing
- `crossOrigin="anonymous"` on `<video>` — required for canvas access (PC ComfyUI sends `Access-Control-Allow-Origin: *`)

**Source metadata reuse:**
- Reads `_fileInfo.fps` and `_fileInfo.frames` from upstream node (Import populates these via `requestVideoFrameCallback`)
- If upstream lacks fps (e.g., generated video without metadata) — falls back to 30fps assumption based on `<video>.duration`

**UI:**
- Embedded `<video>` preview at top — instant scrub during slider drag (no extraction)
- Range slider [0..totalFrames-1] for frame selection
- Frame number + Timecode (`MM:SS:MMM` format) display
- "● LAST" / "↦ Last" toggle button to lock to / jump to last frame
- Status badge: NO VIDEO / EXTRACTING… / FRESH / PENDING / ERROR
- Properties panel: SOURCE VIDEO + EXTRACTED FRAME info cards + manual frame number input

**Performance:**
- Slider scrub seeks the visible video element instantly
- PNG extraction is **debounced 180ms** after last slider change (avoids thrashing during drag)
- Re-extracts only when `(videoUrl, effectiveFrame)` actually changes (`lastExtractedRef` guard)

**Connects from:** Any node producing VIDEO (`fs:import`, `fs:videoGen`, `fs:videoGenPro`, `fs:ltxVideo`, `fs:wanVideo`, `fs:hunyuanVideo`)
**Connects to:** Any node consuming IMAGE (`fs:nanoBanana`, `fs:img2img`, `fs:kontext`, `fs:nextFrame`, `fs:controlNet`, `fs:upscale`, `fs:removeBg`, `fs:preview`)

**No ComfyUI mapping** — pure browser. Equivalent to `VHS_LoadVideo(frame_load_cap=1, skip_first_frames=N)` but stays local.

---

## fs:crop — Crop

**Purpose:** Crop a rectangular region from any image. Drag-resize selection box with optional aspect-ratio lock. Pixel-perfect lossless PNG output. Browser-side, no backend.

**Component:** `src/nodes/CropNode.tsx`
**Properties:** `src/components/properties/CropProperties.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Input | IMAGE | input | Source image (from any IMAGE-producing node) |
| Output | IMAGE | image | Cropped region at exact pixel dimensions (PNG) |

**Parameters (widgetValues):**
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| aspect | string | "custom" | One of: "custom" / "1:1" / "16:9" / "9:16" / "4:3" / "3:4" / "manual" |
| manualW | int | 1 | Numerator of W:H ratio when aspect=manual |
| manualH | int | 1 | Denominator of W:H ratio when aspect=manual |
| cropX | int | 0 | Top-left X in source-image pixel space |
| cropY | int | 0 | Top-left Y in source-image pixel space |
| cropW | int | full | Width of crop area = output width (pixel-perfect) |
| cropH | int | full | Height of crop area = output height (pixel-perfect) |
| _previewUrl | string | null | Output: blob URL of cropped PNG |
| _extractedSize | string | null | "<width> × <height>" of last cropped output |
| _lastSourceUrl | string | null | Internal: tracks source URL to reset crop on input change |

**Default behavior on connection:**
- New crop is the **entire source image** (Custom aspect, cropX=0, cropY=0, cropW=src.w, cropH=src.h)
- When source URL changes, crop resets to full image again

**UI:**
- Embedded scaled preview of source image (max 540px tall)
- Selection box overlay: drag inside body to move, drag corners to resize
- Outside-of-crop area dimmed for visual contrast
- Aspect dropdown below preview: Custom / 1:1 / 16:9 / 9:16 / 4:3 / 3:4 / Manual W:H
- When Manual: two number inputs for W:H ratio appear
- Status badge: NO INPUT / ADJUSTING… / CROPPING… / FRESH / PENDING / ERROR
- Properties panel: SOURCE info + OUTPUT info + manual coord inputs (X, Y, W, H)

**Aspect ratio lock behavior:**
- Custom: free resize, any width/height
- Locked ratios: corner-resize maintains the ratio. Larger drag direction wins; auto-clamps to source bounds.
- Switching to a locked ratio from Custom: snaps current crop to that ratio while keeping its center & area

**Performance:**
- Drag-resize seeks live (no extract during drag) — instant visual feedback
- PNG extraction triggered on pointerup
- Lock + coalesce: only one extract runs at a time, latest crop wins

**Connects from:** Any IMAGE producer (`fs:import`, `fs:localGenerate`, `fs:nanoBanana`, `fs:img2img`, `fs:kontext`, `fs:frameExtract`, `fs:upscale`, `fs:enhance`)
**Connects to:** Any IMAGE consumer (`fs:nanoBanana`, `fs:img2img`, `fs:kontext`, `fs:nextFrame`, `fs:controlNet`, `fs:upscale`, `fs:enhance`, `fs:removeBg`, `fs:preview`, `fs:ltxVideo`)

**No ComfyUI mapping** — pure browser. Equivalent to ImageCrop but runs locally.

**Use cases:**
- Slice a 4-panel storyboard: 4× Crop nodes, each cropping one quadrant → 4 independent pipelines
- Reframe generation output before downstream refinement (e.g., 1024² → center 768²)
- Focus a Frame Extract result on subject before SUPIR upscale

---

## fs:multiCrop — Multi Crop

**Purpose:** Slice a single image into a grid of N×M cells, with **one IMAGE output handle per cell**. Auto-detect grid via whitespace projection. Browser-side, no backend. The "multi-output" companion of fs:crop — instead of duplicating the node N times, configure rows×cols once and connect each cell to its own downstream pipeline.

**Component:** `src/nodes/MultiCropNode.tsx`
**Properties:** `src/components/properties/MultiCropProperties.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Input | IMAGE | input | Source image with grid layout |
| Output | IMAGE | out_<r>_<c> | One handle per cell, 1-indexed (e.g. `out_1_1`, `out_1_2`, `out_2_1`...). Dynamic — number = rows × cols |

**Parameters (widgetValues):**
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| rows | int | 2 | Number of rows in the grid (1-12) |
| cols | int | 2 | Number of columns in the grid (1-12) |
| gapPx | int | 0 | Pixels to shrink from each cell edge (gap/border compensation, 0-200) |
| _cellPreviews | object | {} | Map `{ "out_<r>_<c>": blob URL }` per cell |
| _previewUrl | string | null | Convenience: blob URL of `out_1_1` (for downstream that doesn't use sourceHandle) |
| _lastSourceUrl | string | null | Internal: tracks source URL to reset cells on input change |

**UI:**
- Embedded preview of source image with **grid overlay** (purple lines + cell numbers `r,c` in each cell corner)
- Controls below preview: Rows / Cols / Gap number inputs + **🔍 Auto-detect grid** button
- Status: NO INPUT / DETECTING… / CROPPING… / `<rows>×<cols> — N cells`
- **Dynamic right-side handles**: one per cell, vertically stacked, 1-indexed (`out_1_1` at top-left of grid, then row by row)
- Properties panel: SOURCE info, GRID summary, Manual params, **Cell previews thumbnail grid** (mirrors the actual layout)

**Auto-detect algorithm:**
- Downscales image to ≤512px on long edge
- Computes per-row & per-column **luminance standard deviation**
- Rows/cols where stdev < 20% of max → treated as gap (uniform color = separator)
- Counts contiguous non-gap segments → that's rows / cols
- Capped at 1..12 each
- Best results: storyboards with white/black uniform separators
- Fallback: if detection produces 1×1 (no separators found), keep manual values

**Multi-output integration:**
Downstream nodes resolve per-cell via `getConnectedImageUrl()` in `useNodeHelpers.ts`:
```ts
if (sd.widgetValues?._cellPreviews && edge.sourceHandle) {
  const cell = sd.widgetValues._cellPreviews[edge.sourceHandle];
  if (cell) return cell;
}
```
This means existing nodes (Img2Img, NanoBanana, NextFrame, Preview, etc.) **work as-is** — they connect to a specific Multi Crop output handle and pull that cell's blob URL.

**Performance:**
- Lock + coalesce extraction: only one crop pass at a time
- Each cell encodes to PNG via canvas.toBlob → blob URL via `dataUrlToBlobUrl()`
- For 4×4 = 16 cells on 4K image: ~500-800ms total
- Auto-detect: ~100-200ms typical

**Use cases:**
- 2×2 storyboard → 4 separate pipelines (different prompts, refinements per panel)
- Contact sheet of generation variants → individual selection / refinement
- Comic book page → per-panel translation/recoloring
- Multi-character reference sheet → per-character pipelines

**Connects from:** Any IMAGE producer (`fs:import`, `fs:localGenerate`, `fs:nanoBanana`, `fs:img2img`, `fs:storyboard`, `fs:enhance`, `fs:upscale`)
**Connects to:** Any IMAGE consumer (per cell handle); commonly `fs:img2img`, `fs:kontext`, `fs:nanoBanana`, `fs:nextFrame`, `fs:enhance`, `fs:preview`, `fs:ltxVideo`, `fs:crop` (further crop a single cell)

**No ComfyUI mapping** — pure browser. Equivalent to running ImageCrop N times with grid coords.

---

## fs:controlNet — ControlNet

**Purpose:** Structure-guided generation using ControlNet Union Pro 2.0. Preserves edges, depth, pose, or lineart from a reference image.

**Component:** `src/nodes/ControlNetNode.tsx`
**Workflow:** `src/workflows/controlNet.ts`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Text prompt for generation |
| Input | IMAGE | input | Reference image for structure extraction |
| Output | IMAGE | image | Generated image |

**Parameters (widgetValues):**
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| controlType | string | "canny" | canny, lineart, depth, openpose, tile, segment, scribble |
| strength | float | 0.7 | ControlNet influence strength (0.05–1.5) |
| startPercent | float | 0.0 | When ControlNet starts influencing (0–1) |
| endPercent | float | 1.0 | When ControlNet stops influencing (0–1) |
| steps | int | 4 | Sampling steps |
| cfg | float | 1.0 | CFG scale |
| width | int | 1024 | Output width |
| height | int | 1024 | Output height |
| seed | string | "" | Random seed (empty = random) |
| cannyLow | int | 100 | Canny low threshold (canny type only) |
| cannyHigh | int | 200 | Canny high threshold (canny type only) |

**ComfyUI mapping:**
- Base model: Klein 9B (`flux-2-klein-9b.safetensors`)
- ControlNet: Union Pro 2.0 (`flux-controlnet-union-pro-2.safetensors`)
- Pipeline: UNETLoader → CLIPLoader → VAELoader → LoadImage → [Canny] → ControlNetLoader → SetUnionControlNetType → ControlNetApplyAdvanced → KSampler → VAEDecode → SaveImage

---

## Adding New Nodes — Checklist & Template

### Files to create/modify
1. **Create component:** `src/nodes/MyNode.tsx`
2. **Register in registry:** `src/nodes/registry.ts` — include `description` and full `aiDoc`
3. **Add to App.tsx:** import + add to `nodeTypes` object
4. **Add to store:** `componentMap` in `workflowStore.ts`
5. **Add Properties panel:** section in `src/components/PropertiesPanel.tsx`
6. **Update this doc:** add full node documentation section
7. **CSS:** add styles in `src/styles/theme.css`
8. **Add `.mynode.incompatible`** to the dimming rule in theme.css

---

### TSX Template — Copy this for every new node

```tsx
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";

function MyNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);

  // Highlight logic — use EXACT colors from Canonical Color Map
  const inputHL = connectingDir === "source" && connectingType === "TEXT" ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(inputHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  return (
    <div
      className={`my-node ${selected ? "selected" : ""} ${dimClass}`}
      onClick={() => setSelectedNode(id)}
    >
      {/* ── Header: accent bar + icon + title ── */}
      <div className="my-node-inner">
        <div className="my-accent" />
        <div className="my-header">
          <span className="my-icon">⚡</span>
          <div className="my-header-text">
            <span className="my-title">My Node</span>
            <span className="my-status">READY</span>
          </div>
        </div>
      </div>

      {/* ── Inputs ── */}
      <div className="my-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="prompt"
            className={`slot-handle ${inputHL}`} style={{ color: "#f0c040" }} />
          <TypeBadge color="#f0c040">TEXT</TypeBadge>
          <span className="nanob-input-label">Prompt</span>
        </div>
      </div>

      {/* ── Content area ── */}
      {/* ... preview, controls, etc ... */}

      {/* ── Outputs ── */}
      <div className="my-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <TypeBadge color="#64b5f6">IMAGE</TypeBadge>
          <span className="nanob-output-label">Output</span>
          <Handle type="source" position={Position.Right} id="output_0"
            className={`slot-handle ${outputHL}`} style={{ color: "#64b5f6" }} />
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="type-badge" style={{
      color, borderColor: color + "66", backgroundColor: color + "12",
    }}>{children}</span>
  );
}

export default memo(MyNode);
```

### CSS Template

### Node Width System

| Size | CSS Variable | Width | Use when |
|------|-------------|-------|----------|
| **S** | `var(--node-s)` | 260px | Text-only, no preview (Prompt, Music, TTS) |
| **M** | `var(--node-m)` | 320px | Has image/video preview (LocalGen, Imagen, Scene, CharacterCard) |
| **L** | `var(--node-l)` | 420px | Grid/collection inside (Storyboard) |
| **XL** | `var(--node-xl)` | 500px | Reserved for future wide nodes |

> **MANDATORY:** Every new node MUST use one of these four sizes. Pick the **smallest
> size** that fits the content. Custom widths are NOT allowed unless explicitly
> requested by the user with a clear justification (e.g. a node that displays
> a timeline or dashboard). If in doubt — ask the user before using a non-standard width.

### CSS Template

```css
/* ── My Node ── */
.my-node {
  background: var(--bg-node);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  width: var(--node-m);                  /* S=260, M=320, L=420, XL=500 */
  overflow: visible;                     /* MUST be visible for handles */
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  transition: box-shadow 0.08s, border-color 0.08s;
  position: relative;
}
.my-node.selected {
  border-color: #5b9bd5;                 /* accent color */
  box-shadow: 0 0 0 2px rgba(91,155,213,0.25), 0 4px 16px rgba(0,0,0,0.3);
}

/* Header: HORIZONTAL accent bar on top */
.my-node-inner {
  overflow: hidden;
  border-radius: var(--radius) var(--radius) 0 0;
}
.my-accent {
  height: 3px;                           /* HORIZONTAL, NOT width */
  background: #5b9bd5;                   /* accent color */
}
.my-header {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px 8px;
  border-bottom: 1px solid var(--border);
}

/* Inputs/Outputs containers */
.my-inputs, .my-outputs { padding: 6px 0; }

/* CRITICAL: Use nanob-input-row for ALL input/output rows.
   It has position: relative + min-height: 26px which anchors
   Handle dots to their row. Without this, handles float to center. */
```

### CRITICAL CSS Rules for Handle Positioning

| Property | Value | Why |
|----------|-------|-----|
| Row `position` | `relative` | Handles are `position: absolute` — they need a relative parent to anchor to |
| Row `min-height` | `26px` | Ensures consistent handle vertical position |
| Row `padding` | `4px 14px` | Gives space for handle to sit on the edge |
| Container `padding` | `6px 0` | No horizontal padding on container — rows handle it |
| Node `overflow` | `visible` | Handles must extend beyond node border |

> **TIP:** Prefer reusing `nanob-input-row` class directly instead of creating
> custom row classes. It already has all the correct properties.

---

### MANDATORY Rules

**Logging (MANDATORY for generation/publishing nodes):**
> Every node that generates content or performs actions (generate, publish, upload)
> MUST log events using `log()` from `src/store/logStore.ts`.
> Not required for passive nodes (Comment, Group, Prompt, Import).
>
> Import: `import { log } from "../store/logStore";`
>
> Required log points:
> - On action start: `log("Generate started", { nodeId: id, nodeType: "fs:xxx", nodeLabel: "Name" })`
> - On success: `log("Image ready", { ..., status: "success", details: "1024x1024" })`
> - On error: `log("Failed", { ..., status: "error", details: error.message })`
>
> Log entries appear in the Logs panel with clickable node IDs.

**Media Library:**
> Every node that generates content (images, video, audio) MUST save results
> to the Media Library via `addGenerationToLibrary()` or `useMediaStore.getState().addItem()`.
> For large media (video, audio): save binary to IndexedDB via `saveImage()` from `imageDb.ts`.
> Import: `import { addGenerationToLibrary } from "../store/mediaStore";`
> Import: `import { saveImage } from "../store/imageDb";`

**Generation History (variants):**
> Every node that generates content MUST support history navigation using
> the `ImageHistory` component. This allows users to browse through all
> previous generations and switch between variants.
>
> Required widgetValues: `_history` (string[]), `_historyIndex` (number), `_previewUrl` (string).
> On each generation: append to `_history`, set `_historyIndex` to last, update `_previewUrl`.
> For video: use `<ImageHistory mediaType="video" />`. For audio: `mediaType="audio"`.

**Colors:**
> Every Handle and TypeBadge uses the **exact color** from the Canonical Color Map.
> Same type = same color everywhere. No exceptions.

**Highlights (MANDATORY — verify for every new node):**
> 
> Every handle MUST have highlight logic. Without it, circles won't scale up when dragging connections.
>
> **Required store imports:**
> ```tsx
> const connectingType = useWorkflowStore((s) => s.connectingType);
> const connectingDir = useWorkflowStore((s) => s.connectingDirection);
> ```
>
> **For EACH input handle**, create a highlight variable:
> ```tsx
> const promptHL = connectingDir === "source" && connectingType === "TEXT" ? "highlight" : "";
> const imgHL = connectingDir === "source" && connectingType === "IMAGE" ? "highlight" : "";
> ```
>
> **For EACH output handle:**
> ```tsx
> const outputHL = connectingDir === "target" && (connectingType === "VIDEO" || connectingType === "*") ? "highlight" : "";
> ```
>
> **Apply to Handle:** `className={`slot-handle ${promptHL}`}`
>
> **hasCompatible + dimClass (REQUIRED):**
> ```tsx
> const hasCompatible = connectingType ? !!(promptHL || imgHL || outputHL) : false;
> const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";
> ```
> Apply dimClass to root div: `className={`my-node ${dimClass}`}`
>
> **Incompatible CSS:** node class must be in the dimming rule in theme.css:
> `.my-node.incompatible { opacity: 0.35; }` — add to existing group.
>
> **If node reuses another node's CSS class** (e.g. `videogen-node`), it's already in the dimming rule.
> DO NOT create a new CSS class entry if reusing.

**Visual structure:**
> Accent bar: horizontal, `height: 3px`, full width, at top of node.
> Handle dots: on edge of node, anchored to their row via `position: relative` on row.

**Test procedure (manual):**
1. Drag from every output handle → verify correct targets highlight
2. Drag from external nodes toward every input → verify correct inputs highlight
3. Verify type badge colors match handle colors
4. Verify incompatible nodes dim when dragging
5. Verify handle dots are next to their label, not floating to center

---

## Connection Rules

1. **TEXT → TEXT:** direct pass-through
2. **TEXT → IMAGE input (on generation node):** node internally handles encoding
3. **IMAGE → IMAGE:** direct pass-through
4. **MEDIA → specific type:** validated after file load, red line if incompatible
5. **Any type → * (wildcard):** always compatible
6. **Incompatible types:** red edge + red handles on target

## Workflow Execution

- **Cloud nodes** (Nano Banana): call external API directly from browser
- **Local nodes** (Local Gen): build ComfyUI workflow JSON → POST /api/prompt → WebSocket progress → fetch result
- **Passive nodes** (Prompt, Import): don't execute, only provide data

---

## fs:ltxFlf — LTX 2.3 FLF2V

**Purpose:** LTX-2.3 First-Last-Frame to Video. Given two key frames + a prompt, render a smooth transition video up to ~20s. Simpler companion to `fs:ltxLora` — no audio handle, no LoRA toggle in UI.

**Component:** `src/nodes/LtxFlfNode.tsx`
**Workflow Builder:** `src/workflows/ltxFlf.ts` + `src/workflows/ltxFlf.template.json`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Required prompt |
| Input | IMAGE | first_frame | Required start frame |
| Input | IMAGE | last_frame | Required end frame |
| Output | VIDEO | video | Generated transition video |

**Parameters (widgetValues):**
| Key | Type | Default | Description |
|---|---|---|---|
| frames | number | 121 | Output length in frames (25–481, ~20s @ 24fps) |
| fps | number | 24 | Output FPS (12–30) |
| width | number | 720 | Video width |
| height | number | 1280 | Video height (default 9:16) |
| cfg | number | 1.0 | CFG (CFGGuider nodes 8 + 36) |
| steps | number | 8 | Sampler steps (LTXVScheduler node 2) |
| seed | string | "" | Empty = random per run |
| firstFrameStrength | number | 0.5 | First frame guidance strength (node 2110) |
| lastFrameStrength | number | 1.0 | Last frame guidance strength (node 2108) |
| promptEnhancer | bool | true | LTX-2 prompt instruct expansion (PrimitiveBoolean 2082) |

**ComfyUI Mapping:**
Reuses the canonical FLF2V workflow (`ltxFlf.template.json`). Audio chain stays in the graph but ComfySwitch 2186/2191 are forced `false` at build time (LTX auto-generates audio); rgthree Power Lora Loader 2107 has `lora_1.on=false` so the base model runs clean. LoadImage×2 → ImageResizeKJv2 → LTXVPreprocess → LTXVImgToVideoInplaceKJ → SamplerCustomAdvanced (×2) → LTXVLatentUpsampler → LTXVAddGuide(last_frame) → LTXVCropGuides → VAEDecodeTiled → VHS_VideoCombine.

---

## fs:ltxFml — LTX 2.3 FML

**Purpose:** LTX-2.3 First-Middle-Last Frame to Video (FML2V). Three keyframes + prompt → smooth video that passes through the middle pose. Up to 20s. LTX auto-generates audio (no audio input).

**Component:** `src/nodes/LtxFmlNode.tsx`
**Workflow Builder:** `src/workflows/ltxFml.ts` + `src/workflows/ltxFml.template.json` (~76 nodes; sourced from `LTX-2.3_-_FML2V_First_Middle_Last_Frame_guider.json`, with rgthree SetNode/GetNode indirection resolved and prompt-enhancer subgraph inlined as `2070:*` prefixed IDs)

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Required prompt |
| Input | IMAGE | first_frame | Required start frame |
| Input | IMAGE | middle_frame | Required mid-trajectory pose |
| Input | IMAGE | last_frame | Required end frame |
| Output | VIDEO | video | Generated video |

**Parameters (widgetValues):**
| Key | Type | Default | Description |
|---|---|---|---|
| frames | number | 121 | 25–481 (~5s default, ~20s max @ 24fps) |
| fps | number | 24 | 12–30 |
| width | number | 720 | Video width |
| height | number | 1280 | Video height (default 9:16) |
| cfg | number | 1.0 | CFGGuider 8+36 |
| steps | number | 8 | LTXVScheduler 2 |
| seed | string | "" | Empty = random per run |
| firstFrameStrength | number | 0.7 | Node 2110 (PrimitiveFloat) |
| middleFrameStrength | number | 0.3 | Node 2278 (PrimitiveFloat) — kept low so middle frame guides only the mid-pose, not the entire arc |
| lastFrameStrength | number | 1.0 | Node 2108 (PrimitiveFloat) |
| promptEnhancer | bool | false | LTX-2 prompt instruct expansion (PrimitiveBoolean 2082) |

**ComfyUI Mapping:**
LoadImage×3 (45 FIRST, 47 MIDDLE, 2172 LAST) → ImageResizeKJv2×3 → ResizeImagesByLongerEdge×3 → LTXVPreprocess×3 → LTXVAddGuideMulti(first+last, stage 1) and LTXVAddGuideMulti(first+middle+last, frame_idx_2 = total/2, stage 2) → SamplerCustomAdvanced ×2 → LTXVLatentUpsampler → LTXVCropGuides → VAEDecodeTiled → VHS_VideoCombine. Optional enhancer path via `2070:*` (TextGenerateLTX2Prompt + ComfySwitch on 2082). Power Lora Loader 2107 is present in the graph but `lora_1.on=false`. Spatial upscaler pinned to v1.1.

---

## fs:ltxF — LTX 2.3 F (I2V)

**Purpose:** LTX-2.3 Image-to-Video. One reference image + prompt → animated video up to 20s. Uses the bundled `ltx-2.3-22b-dev-fp8.safetensors` (CheckpointLoaderSimple) + `distilled-lora-384-1.1` (strength 0.5).

**Component:** `src/nodes/LtxFNode.tsx`
**Workflow Builder:** `src/workflows/ltxF.ts` + `src/workflows/ltxF.template.json` (55 nodes; sourced from `LTX-2.3_-_I2V_T2V_Basic_for_checkpoint_models.json`, with SetNode/GetNode resolved, PrimitiveNode 5292 inlined, prompt-enhancer subgraph 5286 inlined as `5286:*` IDs, rgthree UI nodes stripped)

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Required prompt |
| Input | IMAGE | image | Required reference frame |
| Output | VIDEO | video | Generated video |

**Parameters (widgetValues):**
| Key | Type | Default | Description |
|---|---|---|---|
| frames | number | 121 | 25–481 (~5s default, ~20s max @ 24fps) |
| fps | number | 24 | 12–30 |
| width | number | 720 | Default 720 (paired with 9:16 preset) |
| height | number | 1280 | Default 1280 (9:16) |
| cfg | number | 1.0 | CFGGuider 103+129 |
| steps | number | 8 | LTXVScheduler 206 |
| seed | string | "" | RandomNoise 114=seed, 115=seed+1 |
| promptEnhancer | bool | false | LazySwitchKJ-routed — off branch genuinely skips the LLM, no GPU cost |

**Upload behavior:** image input goes through `uploadOnce` (content-hash dedup + HEAD probe) — repeat Generates with the same image are effectively free.

**ComfyUI Mapping:**
CheckpointLoaderSimple 367 → LoraLoaderModelOnly 362 → Power Lora Loader 301 (off pass-through) → LTX2SamplingPreviewOverride 337. Image: LoadImage 167 → ImageResizeKJv2 → LTXVPreprocess → LTXVImgToVideoInplace ×2. Two SamplerCustomAdvanced passes with LTXVLatentUpsampler between → LTXVCropGuides → VAEDecodeTiled → VHS_VideoCombine 140. Audio chain: LTXVAudioVAELoader + LTXVEmptyLatentAudio + LTXVAudioVAEDecode → muxed into VHS_VideoCombine (LTX auto-generates audio).

---

## fs:wanVideo — Wan Video

**Purpose:** Generate video from image + prompt using Wan 2.2 TI2V-5B (GGUF Q8).

**Component:** `src/nodes/WanVideoNode.tsx`
**Workflow Builder:** `src/workflows/wanVideo.ts`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Text prompt |
| Input | IMAGE | start_image | Optional start frame |
| Output | VIDEO | video | Generated video |

**Parameters (widgetValues):**
| Key | Type | Default | Description |
|---|---|---|---|
| steps | number | 30 | Sampling steps |
| cfg | number | 6.0 | CFG scale |
| shift | number | 5.0 | Flow shift |
| width | number | 832 | Video width |
| height | number | 480 | Video height |
| numFrames | number | 49 | Frame count (step 4) |
| fps | number | 16 | Frames per second |
| noiseAug | number | 0.0 | Noise augmentation for more motion |

**ComfyUI Mapping:**
WanVideoModelLoader(TI2V-5B-Q8) → LoadWanVideoT5TextEncoder → WanVideoTextEncode → WanVideoImageToVideoEncode → WanVideoSampler → WanVideoDecode → CreateVideo → SaveVideo

---

## fs:wanSmooth — Wan Smooth

**Purpose:** Wan 2.2 I2V with **RIFE VFI frame interpolation** for ultra-smooth playback. Adapted from [WAN 2.2 Smooth Workflow v5.0](https://civitai.com/) — single-model variant for TI2V-5B.

**Component:** `src/nodes/WanSmoothNode.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Positive prompt |
| Input | IMAGE | start_image | Start frame (image to animate) |
| Output | VIDEO | video | Generated MP4, FPS = source × RIFE multiplier |

**Parameters (Properties):**
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| modelName | string | `wan2.2_ti2v_5B_fp16.safetensors` | UNET, dropdown auto-filtered for `*Wan*`/`*Smooth*` |
| steps | number | **6** (Smooth) | Sampling steps |
| cfg | number | **1.0** (Smooth) | CFG scale |
| shift | number | **8.0** (Smooth) | Flow shift (ModelSamplingSD3) |
| width | number | 720 | Video width |
| height | number | 720 | Video height |
| numFrames | number | 49 | Source frame count (step 4: 13/17/21/.../129) |
| fps | number | 16 | Source FPS |
| rifeMultiplier | number | **2** | RIFE interpolation factor (1=off, 2/3/4) |
| seed | string | "" | Empty = random |
| vaeName | string | `Wan2.2_VAE.pth` | VAE |
| clipName | string | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | CLIP/T5 (type=wan) |
| negativePrompt | string | (Smooth Chinese default) | Empty falls back to canonical Chinese negative |

**ComfyUI workflow built internally:**
```
UNETLoader (wan2.2_ti2v_5B_fp16.safetensors)
  → ModelSamplingSD3 (shift=8)
  → KSampler (euler, simple, steps=6, cfg=1, denoise=1)
       ← CLIPTextEncode (positive)  ← CLIPLoader(type=wan)
       ← CLIPTextEncode (negative)  ← CLIPLoader(type=wan)
       ← Wan22ImageToVideoLatent (start_image, width, height, length)
            ← VAELoader (Wan2.2_VAE.pth)
       ↓
  VAEDecode
  → RIFE VFI (rife49.pth, multiplier=2/3/4, fast_mode=on, ensemble=on)
  → CreateVideo (fps × multiplier)
  → SaveVideo (FS_WANSMOOTH_*.mp4)
```

**Smooth-style sampling rationale:** steps=6 + cfg=1 + euler/simple is a CFG-distillation regime that works well on Wan 2.2 fine-tunes; ModelSamplingSD3 shift=8 is the Wan 2.2 standard. The "smooth" effect itself comes mostly from **RIFE VFI** which interpolates intermediate frames between Wan's outputs — multiplier=2 doubles effective FPS (16→32fps), multiplier=4 quadruples (16→64fps).

**Differences from upstream Smooth Workflow v5.0:**
- Single-model (TI2V-5B) instead of HIGH/LOW noise split (no Wan 2.2 14B HIGH/LOW models on PC)
- No LoRA stack (Power Lora Loader skipped — add later)
- No MMAudio chain (no MMAudio models on PC)
- No ColorMatch / ImageScaleBy upscale chain

**To upgrade to full HIGH/LOW Smooth chain:** download `SmoothMix_I2V_v2_High.safetensors` + `SmoothMix_I2V_v2_Low.safetensors` (or Wan 2.2 14B I2V _High/_Low), then extend workflow with KSamplerAdvanced 2-stage split (start=0/end=3, start=3/end=10000).

---

## fs:wanAnimate — Wan Animate

**Purpose:** Transfer motion from driving video to character image, or replace person in video. Wan 2.2 Animate 14B (GGUF Q4_K_M).

**Component:** `src/nodes/WanAnimateNode.tsx`
**Workflow Builder:** `src/workflows/wanAnimate.ts`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Text prompt |
| Input | IMAGE | ref_image | Character/reference image |
| Input | VIDEO | pose_video | Driving motion video (animate mode) |
| Input | VIDEO | face_video | Face video (replace mode) |
| Output | VIDEO | video | Generated video |

**Modes:**
- **animate**: Reference image + pose/motion video → character performs the motion
- **replace**: Reference image + face video → person in video replaced with character

**Parameters (widgetValues):**
| Key | Type | Default | Description |
|---|---|---|---|
| mode | string | "animate" | "animate" or "replace" |
| steps | number | 30 | Sampling steps |
| cfg | number | 6.0 | CFG scale |
| shift | number | 5.0 | Flow shift |
| width | number | 832 | Video width |
| height | number | 480 | Video height |
| numFrames | number | 81 | Frame count (step 4) |
| fps | number | 16 | Frames per second |
| poseStrength | number | 1.0 | Pose influence strength |
| faceStrength | number | 1.0 | Face influence strength |

**ComfyUI Mapping:**
WanVideoModelLoader(Animate-14B-Q4) + WanVideoBlockSwap(20) → LoadWanVideoT5TextEncoder → WanVideoTextEncode → CLIPVisionLoader + WanVideoClipVisionEncode → WanVideoAnimateEmbeds(pose/face) → WanVideoSampler → WanVideoDecode → CreateVideo → SaveVideo

---

## fs:hunyuanVideo — HunyuanVideo

**Purpose:** Generate video from image + prompt using HunyuanVideo 1.5 I2V (FP8). High quality with efficient VRAM usage.

**Component:** `src/nodes/HunyuanVideoNode.tsx`
**Workflow Builder:** `src/workflows/hunyuanVideo.ts`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Text prompt |
| Input | IMAGE | start_image | Optional start frame |
| Output | VIDEO | video | Generated video |

**Parameters:** steps (30), cfg (6.0), flowShift (9.0), width (512), height (320), numFrames (49), fps (24), denoise (1.0)

**ComfyUI Mapping:**
HyVideoModelLoader(I2V_fp8) → HyVideoVAELoader → DownloadAndLoadHyVideoTextEncoder(auto-download) → HyVideoI2VEncode → HyVideoSampler → HyVideoDecode → CreateVideo → SaveVideo

---

## fs:hunyuanAvatar — HunyuanAvatar

**Purpose:** Audio-driven talking head video. Portrait image + audio → speaking/singing character.

**Component:** `src/nodes/HunyuanAvatarNode.tsx`
**Workflow Builder:** `src/workflows/hunyuanAvatar.ts`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Scene description |
| Input | IMAGE | image | Portrait / character image |
| Input | AUDIO | audio | Speech or music audio |
| Output | VIDEO | video | Talking head video |

**Parameters:** steps (25), cfg (7.5), duration (5s), width (512), height (512), faceSize (3.0), objectName ("person"), videoLength (128)

**Note:** flash_attn replaced with `torch.nn.attention.varlen.varlen_attn` (PyTorch 2.11+) for Windows compatibility. Patched files: `models_audio.py`, `parallel_states.py`.

**ComfyUI Mapping:**
HY_Avatar_Loader(FP8+cpu_offload) → LoadImage + LoadAudio → HY_Avatar_PreData → HY_Avatar_Sampler → CreateVideo → SaveVideo

---

## fs:img2img — Img2Img

**Purpose:** Multi-reference image generation using FLUX.2 Dev with ReferenceLatent chaining. Up to 6 reference images for character/style/object consistency.

**Component:** `src/nodes/Img2ImgNode.tsx`
**Workflow Builder:** `src/workflows/img2img.ts`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Text prompt |
| Input | IMAGE | ref_0..ref_5 | Up to 6 reference images |
| Output | IMAGE | image | Generated image |

**Parameters:** steps (28), cfg (3.5), denoise (0.75), width (1024), height (1024), seed

**ComfyUI Mapping:**
UNETLoader(flux2-dev) → CLIPLoader(mistral) → VAELoader → CLIPTextEncode → VAEEncode(refs) → ReferenceLatent (chained per ref) → KSampler → VAEDecode → SaveImage

---

## fs:kontext — Kontext

**Purpose:** Context-aware image editing using FLUX.1 Kontext Dev. Source image + text describing the desired edit.

**Component:** `src/nodes/KontextNode.tsx`
**Workflow Builder:** `src/workflows/kontext.ts`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Edit instructions |
| Input | IMAGE | input | Source image |
| Output | IMAGE | image | Edited image |

**Parameters:** steps (24), cfg (3.5), denoise (0.85, lower = subtler), seed

**ComfyUI Mapping:**
UNETLoader(kontext) → DualCLIPLoader(clip_l + t5xxl) → VAELoader → FluxKontextImageScale → ReferenceLatent → CLIPTextEncode → KSampler → VAEDecode → SaveImage

---

## fs:nextFrame — Next Frame

**Purpose:** Generate a visually consistent next frame from a source frame via low-denoise img2img. Designed for first/mid/last keyframes for LTX Video.

**Component:** `src/nodes/NextFrameNode.tsx`
**Workflow Builder:** `src/workflows/nextFrame.ts`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Action description |
| Input | IMAGE | input | Previous frame |
| Output | IMAGE | frame | Next frame |

**Parameters:** denoise (0.35, range 0.2-0.55), steps (8), cfg (1.2), seed, negativePrompt (default quality phrases)

**ComfyUI Mapping:** UNETLoader(klein-9b) → CLIPLoader → VAELoader → LoadImage → VAEEncode → CLIPTextEncode(pos+neg) → KSampler(denoise<1) → VAEDecode → SaveImage

---

## fs:inpaint — Inpaint

**Purpose:** Edit masked area of an image with FLUX.1 Fill. Built-in brush tool or external mask input.

**Component:** `src/nodes/InpaintNode.tsx`
**Workflow Builder:** `src/workflows/inpaint.ts`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | What to paint into mask |
| Input | IMAGE | input | Source image |
| Input | IMAGE | mask | White=edit, black=keep (optional, can draw on node) |
| Output | IMAGE | image | Edited image |

**Parameters:** denoise (0.85), steps (8), cfg (1.0), seed

**ComfyUI Mapping:** UNETLoader(flux1-fill) → CLIPLoader → VAELoader → LoadImage + LoadImageMask → VAEEncode → SetLatentNoiseMask → CLIPTextEncode → KSampler → VAEDecode → SaveImage

---

## fs:inpaintCN — Inpaint + ControlNet

**Purpose:** Inpaint with structural guidance. FLUX.1 Fill paints inside mask while ControlNet Union Pro 2.0 preserves edges/depth/pose from the original.

**Component:** `src/nodes/InpaintCNNode.tsx`
**Workflow Builder:** `src/workflows/inpaintCN.ts`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Edit description |
| Input | IMAGE | input | Source image |
| Input | IMAGE | mask | Mask |
| Output | IMAGE | image | Result |

**Parameters:** controlType (canny / soft_edge / depth / pose / gray), cnStrength (0.7), cnEndPercent (0.8), guidance (30), denoise (0.85), steps (20)

**ComfyUI Mapping:** FLUX.1 Fill UNETLoader + DualCLIPLoader + VAELoader + ControlNetLoader(Union Pro 2.0) → DifferentialDiffusion → InpaintModelConditioning → ControlNetApplyAdvanced → KSampler → VAEDecode

---

## fs:removeBg — Remove BG

**Purpose:** Remove background using BRIA RMBG model. Outputs transparent PNG.

**Component:** `src/nodes/RemoveBgNode.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Input | IMAGE | input | Source image |
| Output | IMAGE | image | Subject on transparent background |

**Parameters:** none

**ComfyUI Mapping:** LoadImage → BriaRemoveImageBackground → SaveImage

---

## fs:compare — A/B Compare

**Purpose:** Visual side-by-side comparison of two images with draggable slider.

**Component:** `src/nodes/CompareNode.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Input | IMAGE | image_a | Left image |
| Input | IMAGE | image_b | Right image |
| Output | — | — | Visual only, no output |

**Parameters:** none. Slider position is local to the node UI.

---

## fs:ltxVideo — LTX Video

**Purpose:** Local video generation using LTX-2.3 distilled. ~4s clip from text + optional first/mid/last frames.

**Component:** `src/nodes/LtxVideoNode.tsx`
**Workflow Builder:** `src/workflows/ltxVideo.ts`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Text prompt |
| Input | IMAGE | first_frame / mid_frame / last_frame | Optional keyframes |
| Input | AUDIO | ref_audio | Optional audio reference |
| Output | VIDEO | video | Generated video (animated WebP) |

**Parameters:** steps (8, distilled), cfg (1.0), width (768), height (512), frames (97 ≈ 4s @ 24fps), seed

**ComfyUI Mapping:** LTXVModelLoader → LTXVTextEncoderLoader → LTXVTextEncoder → EmptyLTXVLatentVideo (or with keyframes) → LTXVSampler → LTXVDecode → SaveAnimatedWEBP

---

## fs:mmaudio — MMAudio (silent video → video with audio)

**Purpose:** Add AI-generated audio to a silent video. Analyzes video frames (CLIP for semantic context, Synchformer for motion sync) and synthesizes a matching audio track from a text prompt. Output is the same video re-muxed with the new audio.

**Component:** `src/nodes/MmAudioNode.tsx`
**Workflow Builder:** `src/workflows/mmaudio.ts`
**ComfyUI custom node:** `kijai/ComfyUI-MMAudio`
**Models:** `Kijai/MMAudio_safetensors` (fp16) → `ComfyUI/models/mmaudio/`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Sound description (e.g. `"ocean waves, seagulls, distant boat"`) |
| Input | VIDEO | video | Silent video to add audio to (any source: LTX, Wan, Hunyuan, Import) |
| Output | VIDEO | video | MP4 with H.264 video + AAC audio |

### Parameters

| Key | Default | Description |
|-----|---------|-------------|
| duration | 8 | Audio length in seconds. MMAudio Large 44k = ~8s reliable, longer may degrade |
| steps | 25 | Diffusion steps |
| cfg | 4.5 | Prompt guidance. Higher = stricter prompt match |
| fps | 24 | Source video FPS (for muxing) |
| maskAwayClip | false | If true, only Synchformer motion features used (no CLIP semantics) |
| seed | Random | |
| mmaudioModel | `mmaudio_large_44k_v2_fp16.safetensors` | Main MMAudio diffusion |
| vaeModel | `mmaudio_vae_44k_fp16.safetensors` | Audio VAE |
| synchformerModel | `mmaudio_synchformer_fp16.safetensors` | Motion sync features |
| clipModel | `apple_DFN5B-CLIP-ViT-H-14-384_fp16.safetensors` | Semantic CLIP |

### ComfyUI workflow

```
VHS_LoadVideo (uploaded silent MP4)
  ├─ frames →─────────────────────────┐
  └─ frames →                         │
                                       ↓
MMAudioModelLoader  ──┐                │
MMAudioFeatureUtilsLoader(vae,         │
                synchformer, clip)─┐   │
                                   ↓   ↓
                              MMAudioSampler(prompt, neg, duration, steps, cfg, images=frames)
                                              ↓
                                            AUDIO
                                              ↓
                                     CreateVideo(images, fps, audio)
                                              ↓
                                          SaveVideo (MP4 H.264 + AAC)
```

**BigVGAN vocoder:** auto-downloaded by `MMAudioFeatureUtilsLoader` to `models/mmaudio/nvidia/bigvgan_v2_44khz_128band_512x/` on first use.

---

## fs:videoGen — Video Gen

**Purpose:** Cloud video generation via Google Veo API. Text-to-video and image-to-video.

**Component:** `src/nodes/VideoGenNode.tsx`
**API:** `src/api/geminiApi.ts`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Text prompt |
| Input | IMAGE | input_image | Optional first frame |
| Output | VIDEO | video | Generated video |

**Parameters:** model (`veo-2.0-generate-001` default; veo-3.0-fast/generate, veo-3.1-fast/lite/generate-preview), aspectRatio (16:9 / 9:16 / 1:1)

---

## fs:videoGenPro — Video Gen Pro

**Purpose:** Advanced Veo with full parameter control: first+last frame interpolation, up to 3 reference images, duration, resolution, negative prompt, seed.

**Component:** `src/nodes/VideoGenProNode.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Text prompt |
| Input | IMAGE | first_frame / last_frame | Frame interpolation |
| Input | IMAGE | ref_0..ref_2 | Up to 3 references (Veo 3.1) |
| Output | VIDEO | video | Generated video |

**Parameters:** model, aspectRatio (16:9 / 9:16), duration (4/6/8s), resolution (720p/1080p/4k Veo3.1 only), negativePrompt, seed (Veo 3+), numberOfVideos (1-4 Veo 3+, 1-2 Veo 2)

---

## fs:imagen — Imagen

**Purpose:** Image generation via Google Imagen 4 API.

**Component:** `src/nodes/ImagenNode.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Text prompt |
| Output | IMAGE | image | Generated image |

**Parameters:** model (`imagen-4.0-fast-generate-001` default; `imagen-4.0-generate-001`, `imagen-4.0-ultra-generate-001`), aspectRatio (1:1 / 16:9 / 9:16 / 4:3 / 3:4)

---

## fs:music — Music Gen

**Purpose:** Music generation via Google Lyria 3 API.

**Component:** `src/nodes/MusicNode.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Music description |
| Output | AUDIO | audio | Generated audio clip |

**Parameters:** model (`lyria-3-clip-preview` default 30s, `lyria-3-pro-preview` full track)

---

## fs:tts — TTS

**Purpose:** Text-to-Speech via Gemini TTS.

**Component:** `src/nodes/TtsNode.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | text | Text to speak |
| Output | AUDIO | audio | Generated speech |

**Parameters:** model (`gemini-2.5-flash-preview-tts` / `gemini-2.5-pro-preview-tts`), voice (Kore, Charon, Fenrir, Aoede, Puck, Leda, Orus, Zephyr)

---

## fs:omnivoiceTts — OmniVoice TTS (local)

**Purpose:** Local zero-shot Text-to-Speech via OmniVoice (k2-fsa, Qwen3-0.6B backbone). 600+ languages, 24 kHz output, voice design via instruct attributes. Runs on the user's ComfyUI PC, no API calls.

**Component:** `src/nodes/OmniVoiceTtsNode.tsx`
**Workflow Builder:** `src/workflows/omnivoiceTts.ts`
**ComfyUI custom node:** `ComfyUI-OmniVoice` (local)
**Models:** `k2-fsa/OmniVoice` (HuggingFace) → `ComfyUI/models/omnivoice/` (~3.3 GB)
**Upstream:** <https://github.com/k2-fsa/OmniVoice> — model is actively updated; tail-clipping and other rough edges may already be fixed in newer releases. Check GitHub before deep-troubleshooting.

### Known limitation: tail clipping

OmniVoice pre-allocates a fixed audio-token budget (`target_lens`) before diffusion based on a phonetic-weight heuristic (`omnivoice/utils/duration.py:RuleDurationEstimator`) and hard-truncates output to that length (`omnivoice/models/omnivoice.py` line ~1297: `tokens[i, :, : task.target_lens[i]]`). When the estimate undershoots (sentence-final lengthening, breath pauses, slow voices), the last words are cut. Additionally, `postprocess_output=True` removes >100 ms trailing silence which can clip a quiet fade.

Workarounds in this UI: set `speed=0.9`, set `duration` manually, disable Postprocess Output, or append punctuation/`...` to the prompt. For Clone: provide explicit `refText` to give the estimator an accurate `speed_factor`.

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | text | Text to synthesize |
| Output | AUDIO | audio | 24 kHz speech |

### Parameters

| Key | Default | Description |
|-----|---------|-------------|
| language | `Auto` | One of Auto/en/zh/ja/ko/ru/fr/de/es/it/pt/ar/hi/tr/vi/th/id/pl/nl/sv (or any of 600+ codes) |
| instruct | `""` | Speaker attributes: gender, age, pitch, dialect, whisper, accent — comma-separated |
| numStep | 32 | Diffusion steps, 4-64 |
| guidanceScale | 2.0 | CFG, 0-4 |
| denoise | true | Default ON |
| preprocessPrompt | true | Text normalization |
| postprocessOutput | true | Audio cleanup |
| speed | 1.0 | Playback speed, 0.5-2.0 |
| duration | 0 | Fixed seconds, 0=auto |
| seed | Random | Integer for reproducibility |
| modelPath | `omnivoice` | Subfolder under `ComfyUI/models/omnivoice/` or absolute path |
| precision | `fp16` | fp16 / bf16 / fp32 |
| loadAsr | true | Load Whisper (only Clone needs it; for pure TTS leave default) |

### ComfyUI workflow

```
OmniVoiceModelLoader(modelPath, precision, load_asr) → OMNIVOICE_MODEL ─┐
                                                                       ↓
OmniVoiceTTS(text, language, num_step, guidance_scale, denoise,
             preprocess_prompt, postprocess_output, speed, duration,
             seed, instruct?) → AUDIO
                                                                       ↓
                                                          SaveAudio(audio/FS_OMNI_TTS_<ts>)
```

---

## fs:omnivoiceClone — OmniVoice Clone (zero-shot voice cloning)

**Purpose:** Zero-shot voice cloning. Provide ~5-15s of reference voice and a text → speaks the text in that voice. Cross-lingual: ref language and output language can differ.

**Component:** `src/nodes/OmniVoiceCloneNode.tsx`
**Workflow Builder:** `src/workflows/omnivoiceClone.ts`
**ComfyUI custom node:** `ComfyUI-OmniVoice` (local)
**Models:** same as `fs:omnivoiceTts` (`k2-fsa/OmniVoice`)
**Upstream:** <https://github.com/k2-fsa/OmniVoice> — model is actively updated; cloning fidelity, tail-clipping and other rough edges may already be fixed in newer releases. Check GitHub before deep-troubleshooting.

Tail-clipping caveat is shared with `fs:omnivoiceTts` (see that section). Cloning specifically benefits from supplying an accurate `refText` matching the reference audio — otherwise OmniVoice falls back to the hardcoded heuristic `ref_text="Nice to meet you."` (`num_ref_audio_tokens=25`) which makes the per-character duration estimate inaccurate.

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | text | Text to synthesize |
| Input | AUDIO | ref_audio | Reference voice (5-15s recommended) |
| Output | AUDIO | audio | Cloned speech |

### Parameters

| Key | Default | Description |
|-----|---------|-------------|
| refText | `""` | Transcript of reference. Empty + loadAsr ⇒ Whisper auto-transcribes |
| language | `Auto` | Output language. Can differ from ref language (cross-lingual) |
| instruct | `""` | Optional extra attributes (whisper, slow). Usually empty — ref carries timbre |
| numStep | 32 | Diffusion steps, 4-64 |
| guidanceScale | 2.0 | CFG, 0-4 |
| denoise | true | Default ON |
| preprocessPrompt | true | Text normalization |
| postprocessOutput | true | Audio cleanup |
| speed | 1.0 | Playback speed |
| duration | 0 | Fixed seconds, 0=auto |
| seed | Random | |
| modelPath | `omnivoice` | |
| precision | `fp16` | |
| loadAsr | true | **MUST be ON if refText is empty** |

### ComfyUI workflow

```
OmniVoiceModelLoader(load_asr=true) → OMNIVOICE_MODEL ──┐
LoadAudio(uploaded ref) → AUDIO ────────────────────────┤
                                                         ↓
OmniVoiceClone(text, ref_audio, ref_text?, language, num_step,
               guidance_scale, denoise, preprocess_prompt,
               postprocess_output, speed, duration, seed, instruct?)
                                                         ↓
                                            SaveAudio(audio/FS_OMNI_CLONE_<ts>)
```

The reference audio is uploaded to ComfyUI `input/` folder via `/api/upload/image` (same endpoint used for video uploads — accepts arbitrary files), then read back via `LoadAudio`.

---

## fs:tiktokPublish — TikTok Publish

**Purpose:** Publish video to TikTok via OAuth.

**Component:** `src/nodes/TikTokPublishNode.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Input | VIDEO | video | Video to publish |
| Input | TEXT | caption | Caption text |
| Output | — | — | Side effect (publish) |

**Parameters:** title, privacy (PUBLIC_TO_EVERYONE / FOLLOWER_OF_CREATOR / MUTUAL_FOLLOW_FRIENDS / SELF_ONLY)

**Auth:** Requires TikTok OAuth connection in settings.

---

## fs:critique — Critique

**Purpose:** LLM-based feedback on an image (or text prompt). Returns concrete issues + suggestions.

**Component:** `src/nodes/CritiqueNode.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Input | IMAGE | input | Image to critique (optional) |
| Input | TEXT | prompt | What you wanted (optional) |
| Output | TEXT | text | Structured critique |

**Parameters:** model (`gemini-2.5-flash` / `gemini-2.5-pro` / `gemini-2.0-flash`)

**Behavior:** If no image is connected, critiques the prompt itself (clarity, contradictions). Local mirror state preserves cursor while editing notes.

---

## fs:refine — Prompt Refine

**Purpose:** Rewrite a prompt to produce a better result. Uses optional image as visual context.

**Component:** `src/nodes/RefineNode.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Input | TEXT | prompt | Current prompt |
| Input | IMAGE | input | Current result (optional) |
| Input | TEXT | goal | Desired change (optional) |
| Output | TEXT | text | Refined prompt |

**Parameters:** model (`gemini-2.5-flash` / `gemini-2.5-pro` / `gemini-2.0-flash`)

---

## fs:preview — Preview

**Purpose:** Display image / video / audio output. Fullscreen view, download.

**Component:** `src/nodes/PreviewNode.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Input | MEDIA | input | Any image/video/audio |
| Output | — | — | Display only |

**Parameters:** none. Renders inline preview + fullscreen modal on click.

---

# Utilities

These nodes don't generate new images — they process, analyse, batch, or package existing images.

---

## fs:upscale — Upscale

**Purpose:** Upscale image using ComfyUI's ImageScaleBy with selectable interpolation.

**Component:** `src/nodes/UpscaleNode.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Input | IMAGE | input | Source image |
| Output | IMAGE | image | Upscaled image |

**Parameters:** scale (1.5, 2, 3, 4 multiplier), method (lanczos default / bicubic / bilinear / nearest-exact / area)

**ComfyUI Mapping:** LoadImage → ImageScaleBy(method, scale) → SaveImage

---

## fs:describe — Describe

**Purpose:** Image-to-text. Florence-2 (small, fast) or JoyCaption Alpha Two (rich natural language). Outputs TEXT.

**Component:** `src/nodes/DescribeNode.tsx`
**Workflow Builder:** `src/workflows/autocaption.ts` (`buildAutoCaptionWorkflow`)

| | Type | Name | Description |
|---|---|---|---|
| Input | IMAGE | input | Source image |
| Output | TEXT | text | Caption / tags / OCR |

**Parameters:**
| Key | Type | Default | Description |
|---|---|---|---|
| model | "florence2" \| "joycaption" | "florence2" | Vision model |
| task | string | "detailed_caption" | Florence-2 task: caption / detailed_caption / more_detailed_caption / ocr / prompt_gen_tags |
| captionType | string | "Descriptive" | JoyCaption style: Descriptive / MidJourney / Booru tags / Art Critic / Product Listing / etc. |
| captionLength | string | "medium-length" | JoyCaption length preset |

**ComfyUI Mapping:**
- Florence-2: `DownloadAndLoadFlorence2Model` → `Florence2Run` → `PreviewAny`
- JoyCaption: `Joy_caption_two_load` → `Joy_extra_options` → `Joy_caption_two_advanced` → `PreviewAny`

**Note:** JoyCaption requires patched `joy_caption_two_node.py` (transformers 5.x compatibility — manually iterates `SiglipEncoder.layers`). Model files in `ComfyUI/models/Joy_caption_two/` (~2.5 GB).

---

## fs:batch — Batch

**Purpose:** Drive another node N times, varying a widget value each iteration. List mode = single param sweep, Matrix mode = Cartesian product of two params.

**Component:** `src/nodes/BatchNode.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Input | — | — | None — picks target by node ID |
| Output | — | — | Side effect — triggers target N times |

**Parameters:**
| Key | Type | Default | Description |
|---|---|---|---|
| targetNodeId | string | "" | ID of the downstream generative node |
| mode | "list" \| "matrix" | "list" | Sweep mode |
| paramA | string | "seed" | Widget key to vary |
| valuesA | string | "" | Newline-separated values |
| paramB | string | "" | (matrix only) Second key |
| valuesB | string | "" | (matrix only) Values for paramB |

**Behavior:** Locates target via `data-fs-run-id={id}` DOM attribute; clicks Generate N times with the right widgetValues. Result history accumulates on the target node.

---

## fs:dataset — Dataset

**Purpose:** Collect image+caption pairs and export as a LoRA-training ZIP. Missing captions are auto-filled via Florence-2 / JoyCaption. Optional trigger token is injected into every caption.

**Component:** `src/nodes/DatasetNode.tsx`
**Uses:** `src/workflows/autocaption.ts`

| | Type | Name | Description |
|---|---|---|---|
| Input | IMAGE | img_0..img_N | Image slots (3-30, dynamic via +/− buttons) |
| Input | TEXT | cap_0..cap_N | Optional caption per image |
| Output | — | — | Side effect — downloads ZIP |

**Parameters:**
| Key | Type | Default | Description |
|---|---|---|---|
| _slots | number | 6 | Number of image+caption slot pairs (3-30) |
| model | "florence2" \| "joycaption" | "joycaption" | Auto-caption model for empty captions |
| florenceTask | string | "detailed_caption" | Florence-2 task |
| captionType | string | "Descriptive" | JoyCaption style |
| captionLength | string | "medium-length" | JoyCaption length |
| prefix | string | "dataset" | Filename prefix → `prefix_001.png` / `.txt` |
| triggerToken | string | "" | LoRA trigger token (e.g. `mychar woman`) — injected into every caption. Empty = off |
| triggerPosition | "prefix" \| "suffix" | "prefix" | Where the trigger token is placed |

**Output ZIP structure:**
```
prefix_001.png
prefix_001.txt    ← "<triggerToken>, <caption>" if triggerPosition=prefix
prefix_002.png
prefix_002.txt
…
_manifest.json    ← { count, prefix, triggerToken, triggerPosition, captioner, exportedAt }
```

**Workflow:** suitable for kohya-ss / ai-toolkit / Replicate FLUX LoRA trainers.

---

## fs:enhance — Quality

**Purpose:** AI image quality improvement using SUPIR. Adds detail and sharpness, removes blur/noise.

**Component:** `src/nodes/EnhanceNode.tsx`

| | Type | Name | Description |
|---|---|---|---|
| Input | IMAGE | input | Source image |
| Output | IMAGE | image | Enhanced + upscaled image |

**Parameters:** scale (1-4, default 2), steps (10-50, default 20), restoration (0-1, default 1.0 — control_scale, higher = stays closer to source), cfg (1-10, default 4), colorFix (None / AdaIn / Wavelet)

**ComfyUI Mapping:** SUPIR_Upscale → SaveImage

---

# Tools (visual / canvas-organisation)

These nodes don't participate in execution — they only structure the workspace.

---

## fs:group — Group

**Purpose:** Resizable colored container. Drag nodes inside to organize sections (e.g. "Scene 1", "Character pipeline").

**Component:** `src/nodes/GroupNode.tsx`

**Parameters:** title, color (palette id), width, height. Title editable via double-click; rendered above the box (out of body) on selection.

---

## fs:text — Text

**Purpose:** Free-floating text label / title. Purely informational.

**Component:** `src/nodes/TextNode.tsx`

**Parameters:** text (multiline), fontSize (8-96, default 16), bold, italic, underline, strikethrough, align (left / center / right), color (palette id)

---

## fs:sticker — Sticker

**Purpose:** Miro-style sticky note with 4 bidirectional connection points (one source + one target per side). Drag from any edge to another sticker to draw an arrow. Brainstorming UX.

**Component:** `src/nodes/StickerNode.tsx`

**Parameters:** text, color (palette id, default "yellow"), fontSize (8-40, default 12), bold, italic, underline, strikethrough, align (left / center)

**Behavior:**
- 4 sides × (target + source) = 8 handles, IDs `t-top`/`s-top`/…/`t-left`/`s-left`. Hidden (opacity 0) when not selected to avoid visual clutter.
- Resizable via NodeResizer, also S/M/L presets in Inspector (140/200/280 px square).
- View mode pins text to top when overflowing, vertical-centers when it fits.

---

## fs:comment — Comment

**Purpose:** Sticky note for canvas annotations. No connection points (unlike Sticker).

**Component:** `src/nodes/CommentNode.tsx`

**Parameters:** title, text, color (10-color shared palette with Group, default "yellow"). Title editable via double-click.
