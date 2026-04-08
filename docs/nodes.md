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

### Connection Types
| Type | Color | Description |
|------|-------|-------------|
| TEXT | #f0c040 | Text/prompt data |
| IMAGE | #64b5f6 | Image data |
| VIDEO | #e85d75 | Video data |
| AUDIO | #e8a040 | Audio data |
| MEDIA | #888888 | Any media (auto-detects) |
| MODEL | #b39ddb | AI model reference |
| LATENT | #ab47bc | Latent space data |
| CONDITIONING | #ef9a9a | Conditioning data |

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

## Adding New Nodes — Checklist

1. **Create component:** `src/nodes/MyNode.tsx`
2. **Register in registry:** `src/nodes/registry.ts` — include `description` and full `aiDoc`
3. **Add to App.tsx:** import + add to `nodeTypes` object
4. **Add to store:** `componentMap` in `workflowStore.ts`
5. **Add Properties panel:** section in `src/components/PropertiesPanel.tsx`
6. **Update this doc:** add full node documentation section
7. **CSS:** add styles in `src/styles/theme.css`

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
