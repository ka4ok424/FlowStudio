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
| width | number | 512 | Output width (64-2048) |
| height | number | 512 | Output height (64-2048) |
| steps | number | 20 | Sampling steps (1-50) |
| cfg | number | 7 | CFG scale (1-20) |
| seed | string | "" | Seed, random if empty |

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
