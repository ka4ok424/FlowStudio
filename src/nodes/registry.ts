// ════════════════════════════════════════════════════════════════════
//  FlowStudio Native Node Registry
//  Each native node defines its I/O, adapters, and AI documentation.
//
//  RULE: When adding or modifying a node, you MUST update:
//  1. This registry (description, skills, aiDoc)
//  2. /docs/nodes.md (technical documentation for AI agents)
// ════════════════════════════════════════════════════════════════════

export interface NativeNodeInput {
  name: string;
  type: string;
  adapter?: string;
  adapterMap?: Record<string, any>;
}

export interface NativeNodeOutput {
  name: string;
  type: string;
}

export interface NativeNodeDef {
  type: string;
  label: string;
  icon: string;
  accentColor: string;
  component: string;
  description: string;          // Short description for sidebar tooltip
  inputs: NativeNodeInput[];
  outputs: NativeNodeOutput[];
  // AI agent documentation
  aiDoc: {
    purpose: string;            // What this node does
    skills: string[];           // Use cases
    params?: Record<string, string>;  // Configurable parameters
    connectsTo?: string[];      // Which nodes it typically connects to
    connectsFrom?: string[];    // Which nodes typically connect to it
    examples?: string[];        // Example usage
    comfyMapping?: string;      // How it maps to ComfyUI workflow
  };
  comfyMapping?: {
    classType: string;
    inputMap: Record<string, string>;
  };
}

// ── Registry ───────────────────────────────────────────────────────
const nativeNodes = new Map<string, NativeNodeDef>();

export function registerNativeNode(def: NativeNodeDef) {
  nativeNodes.set(def.type, def);
}

export function getNativeNode(type: string): NativeNodeDef | undefined {
  return nativeNodes.get(type);
}

export function getAllNativeNodes(): NativeNodeDef[] {
  return Array.from(nativeNodes.values());
}

export function isNativeNode(type: string): boolean {
  return nativeNodes.has(type);
}

// Generate AI context from all nodes (for chat assistant)
export function getAIContext(): string {
  const nodes = getAllNativeNodes();
  return nodes.map(n => `
## ${n.label} (${n.type})
${n.aiDoc.purpose}

**Inputs:** ${n.inputs.map(i => `${i.name} (${i.type})`).join(", ") || "none"}
**Outputs:** ${n.outputs.map(o => `${o.name} (${o.type})`).join(", ")}
**Skills:** ${n.aiDoc.skills.join("; ")}
**Connects to:** ${n.aiDoc.connectsTo?.join(", ") || "any"}
**Connects from:** ${n.aiDoc.connectsFrom?.join(", ") || "any"}
${n.aiDoc.params ? `**Params:** ${Object.entries(n.aiDoc.params).map(([k,v]) => `${k}: ${v}`).join("; ")}` : ""}
${n.aiDoc.examples ? `**Examples:** ${n.aiDoc.examples.join("; ")}` : ""}
${n.aiDoc.comfyMapping ? `**ComfyUI:** ${n.aiDoc.comfyMapping}` : ""}
`).join("\n---\n");
}

// ════════════════════════════════════════════════════════════════════
//  Built-in Native Nodes
// ════════════════════════════════════════════════════════════════════

registerNativeNode({
  type: "fs:prompt",
  label: "Prompt",
  icon: "📄",
  accentColor: "#c77dbb",
  component: "PromptNode",
  description: "Text input for prompts, instructions, or any text data. Connects to generation nodes and AI agents.",
  inputs: [],
  outputs: [
    { name: "text", type: "TEXT" },
  ],
  aiDoc: {
    purpose: "Universal text input node. Provides text prompts for image generation, AI agent instructions, or any text-based workflow.",
    skills: [
      "Write image generation prompts",
      "Provide instructions for AI agents",
      "Input text for text-to-video, text-to-audio",
      "Chain multiple prompts together",
    ],
    params: {
      text: "Free-form text content, up to 50,000 characters",
    },
    connectsTo: ["fs:nanoBanana", "fs:localGenerate", "fs:agent"],
    examples: [
      "A cat sitting on a windowsill, sunset lighting, oil painting style",
      "Translate the following text to English and improve grammar",
      "Create a 6-frame storyboard of characters in a kitchen",
    ],
  },
});

registerNativeNode({
  type: "fs:nanoBanana",
  label: "Nano Banana",
  icon: "🍌",
  accentColor: "#f0c040",
  component: "NanoBananaNode",
  description: "Generate images using Google Gemini API. Supports text-to-image, image editing, and multi-reference generation.",
  inputs: [
    { name: "prompt", type: "TEXT" },
    { name: "input_image", type: "IMAGE" },
    { name: "reference", type: "IMAGE" },
  ],
  outputs: [
    { name: "image", type: "IMAGE" },
  ],
  aiDoc: {
    purpose: "Cloud image generation via Google Gemini API (Nano Banana models). Supports text-to-image, image-to-image editing, and up to 14 reference images for style/content guidance.",
    skills: [
      "Generate images from text prompts",
      "Edit existing images with text instructions",
      "Use reference images for style transfer",
      "Generate multiple variations with different seeds",
    ],
    params: {
      model: "gemini-2.5-flash-image (default), gemini-3.1-flash-image-preview (Nano Banana 2), nano-banana-pro-preview (Pro)",
      aspectRatio: "1:1, 16:9, 9:16, 4:3, 3:4",
      seed: "Integer for reproducibility. Same seed + prompt = same result",
      temperature: "0-1. Lower = more precise, higher = more creative",
      numImages: "1-4 images per generation",
      safety: "BLOCK_NONE, BLOCK_ONLY_HIGH, BLOCK_MEDIUM_AND_ABOVE, BLOCK_LOW_AND_ABOVE",
    },
    connectsFrom: ["fs:prompt", "fs:import"],
    connectsTo: ["fs:preview", "fs:export"],
    examples: [
      "Connect Prompt('A golden retriever in space') → Nano Banana → generates image",
      "Connect Import(photo.jpg) to Input Image + Prompt('Make it watercolor') → edits the photo",
      "Connect multiple Import nodes to Reference slots → generates new image in reference style",
    ],
    comfyMapping: "Direct API call to Gemini, not routed through ComfyUI backend",
  },
});

registerNativeNode({
  type: "fs:localGenerate",
  label: "Local Gen",
  icon: "⚡",
  accentColor: "#5b9bd5",
  component: "LocalGenerateNode",
  description: "Generate images using local models via ComfyUI backend. Supports any installed checkpoint (SD, SDXL, Flux, etc).",
  inputs: [
    { name: "prompt", type: "TEXT" },
  ],
  outputs: [
    { name: "image", type: "IMAGE" },
  ],
  aiDoc: {
    purpose: "Local image generation using ComfyUI as backend. Automatically builds a workflow (CheckpointLoader → CLIPTextEncode → KSampler → VAEDecode) and sends it to ComfyUI API.",
    skills: [
      "Generate images from text using local GPU",
      "Use any installed checkpoint model",
      "Fine-tune with steps, CFG, and seed controls",
      "No API costs — runs entirely locally",
    ],
    params: {
      model: "Any checkpoint from ComfyUI models folder (.safetensors, .ckpt)",
      width: "Image width, 64-2048, default 512",
      height: "Image height, 64-2048, default 512",
      steps: "Sampling steps, 1-50, default 20. More = higher quality but slower",
      cfg: "CFG scale, 1-20, default 7. How closely to follow prompt",
      seed: "Integer for reproducibility",
    },
    connectsFrom: ["fs:prompt"],
    connectsTo: ["fs:preview", "fs:export"],
    examples: [
      "Connect Prompt('cyberpunk city at night') → Local Gen (SDXL model, 20 steps) → image",
      "Use Flux Klein for fast generation: select flux-2-klein checkpoint, 4 steps",
    ],
    comfyMapping: "Builds internal workflow: CheckpointLoaderSimple → CLIPTextEncode (pos/neg) → EmptyLatentImage → KSampler → VAEDecode → SaveImage",
  },
});

registerNativeNode({
  type: "fs:preview",
  label: "Preview",
  icon: "👁",
  accentColor: "#81c784",
  component: "PreviewNode",
  description: "Preview any media output. Fullscreen view, download, and compare results from generation nodes.",
  inputs: [
    { name: "input", type: "MEDIA" },
  ],
  outputs: [],
  aiDoc: {
    purpose: "Display and inspect output from generation or processing nodes. Supports image, video, and audio preview with fullscreen and download.",
    skills: [
      "Preview generated images at full resolution",
      "View intermediate results in a pipeline",
      "Download generated media",
      "Fullscreen comparison view",
    ],
    params: {},
    connectsFrom: ["fs:nanoBanana", "fs:localGenerate", "fs:import"],
    examples: [
      "Connect Local Gen output → Preview to see generated image",
      "Add multiple Previews after each step: generate → upscale → preview both",
    ],
  },
});

registerNativeNode({
  type: "fs:characterCard",
  label: "Character Card",
  icon: "🎭",
  accentColor: "#a78bfa",
  component: "CharacterCardNode",
  description: "Character profile card with portrait, description, and approve/reject flow. For building character databases for animation pipelines.",
  inputs: [
    { name: "ai_input", type: "TEXT" },
    { name: "portrait_input", type: "IMAGE" },
  ],
  outputs: [
    { name: "character", type: "CHARACTER" },
    { name: "portrait", type: "IMAGE" },
  ],
  aiDoc: {
    purpose: "Create and manage character profiles for animation/storytelling pipelines. Stores character name, description, and reference portrait. Supports approve/reject workflow for curating AI-generated characters.",
    skills: [
      "Store character profiles with visual references",
      "Approve or reject AI-generated characters",
      "Provide character data to scene generation nodes",
      "Feed portrait to IP-Adapter for character consistency",
    ],
    params: {
      name: "Character name",
      description: "Full character description (appearance, personality, traits)",
      portraitUrl: "Reference portrait image (data URL or blob URL)",
      status: "draft | approved | rejected",
    },
    connectsFrom: ["fs:prompt", "fs:nanoBanana", "fs:localGenerate"],
    connectsTo: ["fs:scene", "fs:localGenerate", "fs:nanoBanana"],
    examples: [
      "AI generates character JSON → Character Card parses name + description",
      "Connect Local Gen → Portrait Input to set reference image",
      "Approve character → output feeds into Scene node for consistent generation",
    ],
  },
});

registerNativeNode({
  type: "fs:scene",
  label: "Scene",
  icon: "🎬",
  accentColor: "#e85d75",
  component: "SceneNode",
  description: "Generate a scene with characters. Uses IP-Adapter for character consistency. Connects to Storyboard for sequencing.",
  inputs: [
    { name: "action", type: "TEXT" },
    { name: "background", type: "IMAGE" },
    { name: "character_0", type: "CHARACTER" },
  ],
  outputs: [
    { name: "scene", type: "IMAGE" },
  ],
  aiDoc: {
    purpose: "Scene generation node for animation pipeline. Takes character cards + action description + optional background, generates a scene image with character consistency via IP-Adapter.",
    skills: [
      "Generate scenes with multiple characters",
      "Maintain character consistency via IP-Adapter",
      "Composite characters over backgrounds",
      "Build animation storyboard frames",
    ],
    params: {
      sceneTitle: "Scene title for storyboard display",
      action: "Scene action/description text",
      model: "Checkpoint model for generation",
      width: "Output width, default 1024",
      height: "Output height, default 576",
      steps: "Sampling steps, default 20",
      cfg: "CFG scale, default 7",
      _characterCount: "Number of character input slots (1-8)",
    },
    connectsFrom: ["fs:characterCard", "fs:prompt", "fs:localGenerate", "fs:import"],
    connectsTo: ["fs:storyboard", "fs:preview"],
    examples: [
      "Connect 2 CharacterCards + Prompt('They meet in a forest') → generates scene with both characters",
      "Connect background from LocalGen + characters → composites scene",
    ],
  },
});

registerNativeNode({
  type: "fs:storyboard",
  label: "Storyboard",
  icon: "📋",
  accentColor: "#ff9800",
  component: "StoryboardNode",
  description: "Visual storyboard showing all scenes in sequence. Connect Scene nodes to build the complete story timeline.",
  inputs: [
    { name: "scene_0", type: "IMAGE" },
  ],
  outputs: [],
  aiDoc: {
    purpose: "Container node for organizing scenes into a visual storyboard/timeline. Shows thumbnails of all connected scenes in sequence.",
    skills: [
      "Display scenes in order",
      "Visual timeline overview",
      "Track storyboard progress",
    ],
    params: {
      title: "Storyboard title",
      _sceneCount: "Number of scene input slots (1-20)",
    },
    connectsFrom: ["fs:scene"],
    examples: [
      "Connect 8 Scene nodes → see full storyboard grid",
    ],
  },
});

registerNativeNode({
  type: "fs:videoGen",
  label: "Video Gen",
  icon: "🎥",
  accentColor: "#e85d75",
  component: "VideoGenNode",
  description: "Generate video using Google Veo API. Text-to-video and image-to-video.",
  inputs: [
    { name: "prompt", type: "TEXT" },
    { name: "input_image", type: "IMAGE" },
  ],
  outputs: [{ name: "video", type: "VIDEO" }],
  aiDoc: {
    purpose: "Video generation via Google Veo API. Supports text-to-video and image-to-video.",
    skills: ["Generate video from text", "Animate images", "Create scene clips"],
    params: { model: "MUST use exact API ID: veo-2.0-generate-001 (default), veo-3.0-fast-generate-001, veo-3.0-generate-001, veo-3.1-fast-generate-preview, veo-3.1-lite-generate-preview, veo-3.1-generate-preview", aspectRatio: "16:9, 9:16, 1:1" },
    connectsFrom: ["fs:prompt", "fs:import", "fs:scene"],
    connectsTo: ["fs:storyboard", "fs:preview"],
    examples: ["Prompt('A cat walking') → Video Gen → 5s video clip"],
  },
});

registerNativeNode({
  type: "fs:videoGenPro",
  label: "Video Gen Pro",
  icon: "🎬",
  accentColor: "#e85d75",
  component: "VideoGenProNode",
  description: "Advanced video generation with all Veo parameters: first/last frame, reference images, duration, resolution, negative prompt, seed.",
  inputs: [
    { name: "prompt", type: "TEXT" },
    { name: "first_frame", type: "IMAGE" },
    { name: "last_frame", type: "IMAGE" },
    { name: "ref_0", type: "IMAGE" },
  ],
  outputs: [{ name: "video", type: "VIDEO" }],
  aiDoc: {
    purpose: "Advanced video generation via Veo API with full parameter control. Supports first/last frame interpolation, reference images, duration, resolution, negative prompts and seed.",
    skills: ["Generate video with precise control", "First+last frame interpolation", "Reference-guided generation", "Multi-resolution output"],
    params: {
      model: "MUST use exact API ID: veo-2.0-generate-001 (default), veo-3.0-generate-001, veo-3.1-generate-preview, etc.",
      aspectRatio: "16:9, 9:16",
      duration: "4, 6, or 8 seconds",
      resolution: "720p, 1080p, 4k (Veo 3.1 only)",
      negativePrompt: "What to avoid in the video",
      seed: "0-4294967295 (Veo 3+ only)",
      numberOfVideos: "1-4 (Veo 3+ max 4, Veo 2 max 2)",
    },
    connectsFrom: ["fs:prompt", "fs:import", "fs:localGenerate", "fs:scene", "fs:characterCard"],
    connectsTo: ["fs:preview", "fs:storyboard"],
    examples: [
      "First frame + Last frame → smooth interpolation video",
      "3 reference images → style-consistent video (Veo 3.1)",
      "Negative prompt 'no text, no watermark' + 1080p resolution",
    ],
  },
});

registerNativeNode({
  type: "fs:imagen",
  label: "Imagen",
  icon: "🖼",
  accentColor: "#42a5f5",
  component: "ImagenNode",
  description: "Generate images using Google Imagen 4 API. High quality image generation.",
  inputs: [{ name: "prompt", type: "TEXT" }],
  outputs: [{ name: "image", type: "IMAGE" }],
  aiDoc: {
    purpose: "Image generation via Google Imagen 4 API.",
    skills: ["Generate high quality images from text"],
    params: { model: "MUST use exact API ID: imagen-4.0-fast-generate-001 (default), imagen-4.0-generate-001, imagen-4.0-ultra-generate-001", aspectRatio: "1:1, 16:9, 9:16, 4:3, 3:4" },
    connectsFrom: ["fs:prompt"],
    connectsTo: ["fs:preview", "fs:characterCard", "fs:scene"],
    examples: ["Prompt('Sunset over mountains') → Imagen → HD image"],
  },
});

registerNativeNode({
  type: "fs:music",
  label: "Music Gen",
  icon: "🎵",
  accentColor: "#e8a040",
  component: "MusicNode",
  description: "Generate music using Google Lyria 3 API. Create 30-second clips or full tracks.",
  inputs: [{ name: "prompt", type: "TEXT" }],
  outputs: [{ name: "audio", type: "AUDIO" }],
  aiDoc: {
    purpose: "Music generation via Google Lyria 3 API.",
    skills: ["Generate music from text description", "Create background tracks"],
    params: { model: "MUST use exact API ID: lyria-3-clip-preview (default, 30s), lyria-3-pro-preview" },
    connectsFrom: ["fs:prompt"],
    examples: ["Prompt('Epic orchestral battle music') → Music Gen → audio clip"],
  },
});

registerNativeNode({
  type: "fs:tts",
  label: "TTS",
  icon: "🗣",
  accentColor: "#ce93d8",
  component: "TtsNode",
  description: "Text-to-Speech using Gemini TTS. Multiple voices available.",
  inputs: [{ name: "text", type: "TEXT" }],
  outputs: [{ name: "audio", type: "AUDIO" }],
  aiDoc: {
    purpose: "Text-to-Speech via Gemini TTS API. Convert text to natural speech.",
    skills: ["Convert text to speech", "Multiple voice options", "Narration for animations"],
    params: { model: "MUST use exact API ID: gemini-2.5-flash-preview-tts (default), gemini-2.5-pro-preview-tts", voice: "Kore, Charon, Fenrir, Aoede, Puck, Leda, Orus, Zephyr" },
    connectsFrom: ["fs:prompt"],
    examples: ["Prompt('Hello world') → TTS (voice: Kore) → audio"],
  },
});

// MultiRef node REMOVED — used SDXL Lightning + IPAdapter (not available on current setup)

registerNativeNode({
  type: "fs:group",
  label: "Group",
  icon: "📦",
  accentColor: "#5b9bd5",
  component: "GroupNode",
  description: "Visual group box to organize nodes. Resizable, colored background. No inputs/outputs.",
  inputs: [],
  outputs: [],
  aiDoc: {
    purpose: "Visual container to group related nodes. Use for organizing scenes, characters, audio pipelines etc.",
    skills: ["Organize nodes visually", "Label sections of the workflow"],
    params: {
      title: "Group title",
      color: "red, blue, green, purple, orange, cyan",
      width: "Group width in pixels (default 800)",
      height: "Group height in pixels (default 400)",
    },
    examples: [
      "Create group 'Scene 1' at x:50 y:50 with width:1200 height:600",
      "Place prompt + localGen + preview nodes inside the group area",
    ],
  },
});

registerNativeNode({
  type: "fs:text",
  label: "Text",
  icon: "🔤",
  accentColor: "#ffffff",
  component: "TextNode",
  description: "Free-floating text label on the canvas. Purely informational — no inputs or outputs, does not affect workflow.",
  inputs: [],
  outputs: [],
  aiDoc: {
    purpose: "Add a text annotation or title to the canvas. Does not participate in the workflow.",
    skills: ["Label sections", "Add captions", "Visual documentation of the workflow"],
    params: {
      text: "The text to display (multiline supported)",
      fontSize: "8-96 px, default 16",
      bold: "Boolean toggle",
      italic: "Boolean toggle",
      underline: "Boolean toggle",
      strikethrough: "Boolean toggle",
      align: "left | center | right",
      color: "Palette id from EXTENDED_COLORS",
    },
    examples: [
      "Title above a group: 'Character generation → Kontext variations'",
    ],
  },
});

registerNativeNode({
  type: "fs:sticker",
  label: "Sticker",
  icon: "🗒️",
  accentColor: "#fdd835",
  component: "StickerNode",
  description: "Miro-style sticky note with 4 connection points. Drag from any edge to another sticker to draw an arrow. Used for brainstorming, not workflow execution.",
  inputs: [],   // handles are added directly in the component (all 4 sides bidirectional)
  outputs: [],
  aiDoc: {
    purpose: "Free-form sticky note that can be linked to other stickers with arrows. Brainstorming / mind-map UX on the canvas.",
    skills: ["Stickies with arrows", "Diagram ideas before building a workflow"],
    params: {
      text: "Sticker body text",
      color: "Palette id from EXTENDED_COLORS",
      fontSize: "10-40 px, default 14",
      bold: "Boolean toggle",
      italic: "Boolean toggle",
      underline: "Boolean toggle",
      strikethrough: "Boolean toggle",
    },
    examples: [
      "Three linked stickers: 'Idea' → 'Refinement' → 'Final'",
    ],
  },
});

registerNativeNode({
  type: "fs:comment",
  label: "Comment",
  icon: "📝",
  accentColor: "#f0c040",
  component: "CommentNode",
  description: "Sticky note for comments and annotations. No inputs/outputs.",
  inputs: [],
  outputs: [],
  aiDoc: {
    purpose: "Add text notes/comments to the canvas. Use to explain logic, mark TODOs, or annotate sections.",
    skills: ["Leave notes on canvas", "Explain workflow logic"],
    params: {
      text: "Comment text",
      color: "yellow, blue, green, red, purple",
    },
    examples: [
      "Add comment 'This generates character portraits' near the CharacterCard nodes",
    ],
  },
});

registerNativeNode({
  type: "fs:tiktokPublish",
  label: "TikTok Publish",
  icon: "📤",
  accentColor: "#ff2d55",
  component: "TikTokPublishNode",
  description: "Publish video to TikTok. Requires TikTok OAuth connection.",
  inputs: [
    { name: "video", type: "VIDEO" },
    { name: "caption", type: "TEXT" },
  ],
  outputs: [],
  aiDoc: {
    purpose: "Publish generated video to TikTok. Connect Video Gen output → video input, Prompt → caption input.",
    skills: ["Publish video to TikTok", "Set privacy level", "AI content disclosure"],
    params: {
      title: "Video caption/description",
      privacy: "PUBLIC_TO_EVERYONE, FOLLOWER_OF_CREATOR, MUTUAL_FOLLOW_FRIENDS, SELF_ONLY",
    },
    connectsFrom: ["fs:videoGen", "fs:videoGenPro", "fs:prompt"],
    examples: ["Video Gen → TikTok Publish + Prompt (caption)"],
  },
});

registerNativeNode({
  type: "fs:upscale",
  label: "Upscale",
  icon: "🔍",
  accentColor: "#4dd0e1",
  component: "UpscaleNode",
  description: "Upscale image using ComfyUI. Supports lanczos, bicubic, bilinear methods with 1.5x-4x scale.",
  inputs: [{ name: "input", type: "IMAGE" }],
  outputs: [{ name: "image", type: "IMAGE" }],
  aiDoc: {
    purpose: "Upscale images to higher resolution using various interpolation methods via ComfyUI.",
    skills: ["Increase image resolution", "Multiple upscale methods", "Up to 4x scale"],
    params: {
      scale: "1.5, 2, 3, or 4 (multiplier)",
      method: "lanczos (default), bicubic, bilinear, nearest-exact, area",
    },
    connectsFrom: ["fs:localGenerate", "fs:nanoBanana", "fs:imagen", "fs:scene", "fs:multiRef", "fs:import"],
    connectsTo: ["fs:preview", "fs:videoGen", "fs:videoGenPro", "fs:characterCard"],
    examples: ["Local Gen → Upscale (2x lanczos) → Preview"],
  },
});

registerNativeNode({
  type: "fs:import",
  label: "Import",
  icon: "⬆",
  accentColor: "#4ecdc4",
  component: "ImportNode",
  description: "Import any media file (image, video, audio). Auto-detects type and shows preview with file info.",
  inputs: [],
  outputs: [
    { name: "media", type: "MEDIA" },
  ],
  aiDoc: {
    purpose: "Universal media import node. Loads image, video, or audio files via drag-and-drop or file picker. Output type changes dynamically based on loaded file (IMAGE, VIDEO, or AUDIO).",
    skills: [
      "Import images for editing or reference",
      "Import video for processing",
      "Import audio for TTS or mixing",
      "Preview loaded media with file info (resolution, size, format, duration)",
    ],
    params: {
      _mediaType: "Auto-detected: 'image', 'video', or 'audio'",
      _fileName: "Original file name",
      _fileInfo: "Object with resolution, size, format, duration, bitrate",
    },
    connectsTo: ["fs:nanoBanana", "fs:localGenerate", "fs:agent"],
    examples: [
      "Drop a photo → connects to Nano Banana 'Input Image' for editing",
      "Drop reference images → connect to Nano Banana 'Reference' slots",
      "Drop audio → connect to future TTS/audio processing nodes",
    ],
    comfyMapping: "File uploaded to ComfyUI /upload/image endpoint, then referenced via LoadImage node",
  },
});

registerNativeNode({
  type: "fs:describe",
  label: "Describe",
  icon: "🔍",
  accentColor: "#9c7bff",
  component: "DescribeNode",
  description: "Image-to-text: local Florence-2 or JoyCaption Alpha Two. Outputs TEXT describing or tagging the image.",
  inputs: [
    { name: "input", type: "IMAGE" },
  ],
  outputs: [
    { name: "text", type: "TEXT" },
  ],
  aiDoc: {
    purpose: "Generate textual description/tags/caption from an image using a local vision model on ComfyUI.",
    skills: [
      "Produce detailed captions of images (Florence-2)",
      "Produce stylistic/booru/training-prompt captions (JoyCaption)",
      "Extract OCR text (Florence-2)",
      "Feed resulting text into Prompt → Kontext / Inpaint loops",
    ],
    params: {
      model: "'florence2' (default, small+fast) or 'joycaption' (larger, richer natural-language)",
      task: "Florence-2 task: caption / detailed_caption / more_detailed_caption / ocr / ...",
      captionType: "JoyCaption style: Descriptive, MidJourney, Booru tags, Art Critic, Product Listing, etc.",
      captionLength: "JoyCaption length preset (very short…very long or explicit word count)",
    },
    connectsFrom: ["fs:localGenerate", "fs:nanoBanana", "fs:kontext", "fs:import", "fs:scene"],
    connectsTo: ["fs:prompt", "fs:kontext", "fs:inpaint", "fs:inpaintCN"],
    examples: [
      "Import(photo) → Describe(Florence-2, detailed_caption) → Prompt → Kontext(edit)",
      "Generate(LocalGen) → Describe(JoyCaption, Booru tag list) → feed into training dataset",
    ],
    comfyMapping: "Florence-2: DownloadAndLoadFlorence2Model + Florence2Run + PreviewAny. JoyCaption: Joy_caption_two_load + Joy_extra_options + Joy_caption_two_advanced + PreviewAny.",
  },
});

registerNativeNode({
  type: "fs:batch",
  label: "Batch",
  icon: "🎲",
  accentColor: "#ec407a",
  component: "BatchNode",
  description: "Sweep a parameter across a list of values OR run a Cartesian matrix of multiple parameters. Triggers any chosen generative node N times, randomizing inputs.",
  inputs: [],
  outputs: [],
  aiDoc: {
    purpose: "Drive another node N times, varying a widget value each iteration. List mode = single param sweep, Matrix mode = Cartesian product of two params.",
    skills: [
      "Run 10 prompts through the same generative node",
      "Sweep CFG=[3,5,7,9] × steps=[8,16,24] for tuning",
    ],
    params: {
      targetNodeId: "ID of the downstream generative node to drive",
      mode: "'list' or 'matrix'",
      paramA: "widget key to vary (e.g. 'seed', 'denoise', 'cfg')",
      valuesA: "newline-separated list of values for paramA",
      paramB: "(matrix) second key to vary",
      valuesB: "(matrix) values for paramB",
    },
    examples: [
      "Batch(target=Kontext, param=seed, values=10 random) → 10 outputs in Kontext history",
      "Batch(matrix, param=cfg [3,5,7] × steps [16,24]) → 6 outputs",
    ],
  },
});

registerNativeNode({
  type: "fs:dataset",
  label: "Dataset",
  icon: "📦",
  accentColor: "#66bb6a",
  component: "DatasetNode",
  description: "Collect image+caption pairs and export as a LoRA-training ZIP. Missing captions are auto-filled via the selected vision model.",
  inputs: [
    // Dynamic image slots img_0, img_1, ... shown in the node UI
  ],
  outputs: [],
  aiDoc: {
    purpose: "Bootstrap a LoRA training dataset. Accepts N image inputs; if no caption text is provided for an image, runs it through Florence-2 / JoyCaption to auto-caption; exports a ZIP of image_001.png + image_001.txt pairs ready for kohya-ss / ai-toolkit.",
    skills: ["Auto-caption via vision model", "Bulk export for LoRA training", "Inject character trigger token into every caption"],
    params: {
      model: "'florence2' or 'joycaption' — which vision model to use for auto-captioning",
      captionTask: "Florence-2 task ('detailed_caption' / 'more_detailed_caption' / ...) or JoyCaption type",
      prefix: "Base filename prefix, e.g. 'asmr_dirt'",
      triggerToken: "Optional. Token that identifies the LoRA subject (e.g. 'mychar woman'). Inserted into every caption — both auto-generated and user-provided. Empty = no trigger.",
      triggerPosition: "'prefix' (default, recommended) or 'suffix'. Where the trigger token is placed inside each caption.",
    },
    connectsFrom: ["fs:localGenerate", "fs:nanoBanana", "fs:kontext", "fs:import", "fs:describe"],
    examples: [
      "10 × LocalGen → Dataset(model=joycaption, triggerToken='mychar woman') → Export ZIP → upload to kohya trainer",
    ],
  },
});

registerNativeNode({
  type: "fs:critique",
  label: "Critique",
  icon: "🧐",
  accentColor: "#ef5350",
  component: "CritiqueNode",
  description: "Get a structured critique of an image (or a prompt) via Gemini vision. Outputs TEXT with concrete issues and suggestions.",
  inputs: [
    { name: "input", type: "IMAGE" },   // optional
    { name: "prompt", type: "TEXT" },   // optional: what you wanted
  ],
  outputs: [{ name: "text", type: "TEXT" }],
  aiDoc: {
    purpose: "LLM-based feedback. Either analyses an image (what's wrong, composition/anatomy/lighting) or, if no image is connected, critiques the text prompt itself.",
    skills: ["Critique a generated image", "Suggest concrete improvements", "Analyse a prompt for clarity"],
    params: { model: "gemini-2.5-flash | gemini-2.5-pro | gemini-2.0-flash" },
    connectsFrom: ["fs:localGenerate", "fs:nanoBanana", "fs:kontext", "fs:describe", "fs:prompt"],
    connectsTo: ["fs:prompt", "fs:refine"],
    examples: ["LocalGen → Critique(model=Flash) → PromptRefine → Prompt → Kontext"],
  },
});

registerNativeNode({
  type: "fs:refine",
  label: "Prompt Refine",
  icon: "✨",
  accentColor: "#ffb74d",
  component: "RefineNode",
  description: "Rewrite a prompt to produce a better result. Uses an optional image as visual context (what the current prompt produced).",
  inputs: [
    { name: "prompt", type: "TEXT" },   // required: current prompt
    { name: "input", type: "IMAGE" },   // optional: current result
    { name: "goal", type: "TEXT" },     // optional: what user wants different
  ],
  outputs: [{ name: "text", type: "TEXT" }],
  aiDoc: {
    purpose: "Rewrite a prompt using LLM. If an image is supplied, the model sees the current result and can fix specific issues.",
    skills: ["Improve prompt wording", "Address issues seen in current result"],
    params: { model: "gemini-2.5-flash | gemini-2.5-pro | gemini-2.0-flash" },
    connectsFrom: ["fs:prompt", "fs:describe", "fs:critique", "fs:localGenerate"],
    connectsTo: ["fs:prompt", "fs:kontext", "fs:inpaintCN"],
    examples: ["Prompt('portrait') + LocalGen output → Refine → better Prompt → regenerate"],
  },
});

registerNativeNode({
  type: "fs:img2img",
  label: "Img2Img",
  icon: "🎨",
  accentColor: "#e040fb",
  component: "Img2ImgNode",
  description: "Multi-reference image generation using FLUX.2 Dev. Up to 6 reference images for character/style/object consistency.",
  inputs: [
    { name: "prompt", type: "TEXT" },
    { name: "ref_0", type: "IMAGE" },
    { name: "ref_1", type: "IMAGE" },
    { name: "ref_2", type: "IMAGE" },
    { name: "ref_3", type: "IMAGE" },
    { name: "ref_4", type: "IMAGE" },
    { name: "ref_5", type: "IMAGE" },
  ],
  outputs: [
    { name: "image", type: "IMAGE" },
  ],
  aiDoc: {
    purpose: "Multi-reference generation using FLUX.2 Dev with ReferenceLatent chaining. Upload 1-4 reference images and describe what to generate.",
    skills: [
      "Character consistency across generations",
      "Style transfer from reference images",
      "Multi-reference composition (combine characters, objects, styles)",
      "Editing with text instructions",
    ],
    params: {
      steps: "Sampling steps, 20-50, default 28",
      cfg: "CFG scale, 1-10, default 3.5",
      denoise: "Denoise strength, 0.1-1.0, default 0.75",
      width: "Output width, default 1024",
      height: "Output height, default 1024",
      seed: "Integer for reproducibility",
    },
    connectsFrom: ["fs:prompt", "fs:localGenerate", "fs:nanoBanana", "fs:import", "fs:characterCard"],
    connectsTo: ["fs:preview", "fs:upscale", "fs:videoGen", "fs:videoGenPro"],
    examples: [
      "Import(face) + Import(outfit) → Img2Img('person wearing outfit in park') → Preview",
      "CharacterCard(hero) + Import(background) → Img2Img('hero standing in scene') → Preview",
    ],
    comfyMapping: "UNETLoader(flux2-dev) + CLIPLoader(mistral) + ReferenceLatent chain + KSampler",
  },
});

registerNativeNode({
  type: "fs:kontext",
  label: "Kontext",
  icon: "✏️",
  accentColor: "#ff7043",
  component: "KontextNode",
  description: "Edit images with text instructions using FLUX.1 Kontext. Change clothing, background, style — describe the edit in text.",
  inputs: [
    { name: "prompt", type: "TEXT" },
    { name: "input", type: "IMAGE" },
  ],
  outputs: [
    { name: "image", type: "IMAGE" },
  ],
  aiDoc: {
    purpose: "Context-aware image editing using FLUX.1 Kontext Dev. Takes a source image and a text description of the desired edit.",
    skills: [
      "Change clothing, hair, accessories",
      "Modify background or scene",
      "Style transfer with text instructions",
      "Object replacement",
    ],
    params: {
      steps: "Sampling steps, 15-30, default 24",
      cfg: "CFG scale, 1-7, default 3.5",
      denoise: "Edit strength, 0.1-1.0, default 0.85. Lower = subtler edits",
      seed: "Integer for reproducibility",
    },
    connectsFrom: ["fs:prompt", "fs:localGenerate", "fs:nanoBanana", "fs:import", "fs:characterCard"],
    connectsTo: ["fs:preview", "fs:upscale", "fs:videoGen", "fs:videoGenPro"],
    examples: [
      "Local Gen(portrait) → Kontext('change shirt to red hoodie') → Preview",
      "Import(photo) → Kontext('replace background with beach sunset') → Preview",
    ],
    comfyMapping: "UNETLoader(kontext) + DualCLIPLoader(clip_l+t5xxl) + FluxKontextImageScale + ReferenceLatent + KSampler",
  },
});

registerNativeNode({
  type: "fs:ltxVideo",
  label: "LTX Video",
  icon: "🎬",
  accentColor: "#e85d75",
  component: "LtxVideoNode",
  description: "Generate video locally using LTX-2.3 model. 22B parameters with first/mid/last frame control and audio.",
  inputs: [
    { name: "prompt", type: "TEXT" },
    { name: "first_frame", type: "IMAGE" },
    { name: "mid_frame", type: "IMAGE" },
    { name: "last_frame", type: "IMAGE" },
    { name: "ref_audio", type: "AUDIO" },
  ],
  outputs: [
    { name: "video", type: "VIDEO" },
  ],
  aiDoc: {
    purpose: "Local video generation using LTX-2.3 via ComfyUI. Generates short video clips from text prompts.",
    skills: [
      "Text-to-video generation",
      "Up to 97 frames at 24fps (~4 seconds)",
      "FP8 quantized for 32GB VRAM",
      "Distilled model: 8 steps for fast generation",
    ],
    params: {
      steps: "Sampling steps, 4-20, default 8 (distilled)",
      cfg: "CFG scale, 1-5, default 1.0",
      width: "Video width, default 768",
      height: "Video height, default 512",
      frames: "Number of frames, 25-193, default 97 (~4s at 24fps)",
      seed: "Integer for reproducibility",
    },
    connectsFrom: ["fs:prompt"],
    connectsTo: ["fs:preview", "fs:tiktokPublish"],
    examples: [
      "Prompt('a cat walking in a garden') → LTX Video → Preview",
      "Prompt('cinematic drone shot over mountains') → LTX Video (97 frames) → TikTok Publish",
    ],
    comfyMapping: "LTXVModelLoader + LTXVTextEncoderLoader + LTXVTextEncoder + EmptyLTXVLatentVideo + LTXVSampler + LTXVDecode + SaveAnimatedWEBP",
  },
});

registerNativeNode({
  type: "fs:nextFrame",
  label: "Next Frame",
  icon: "🎞️",
  accentColor: "#66bb6a",
  component: "NextFrameNode",
  description: "Generate next frame as img2img variation from previous frame. For creating keyframes for video generation.",
  inputs: [
    { name: "prompt", type: "TEXT" },
    { name: "input", type: "IMAGE" },
  ],
  outputs: [
    { name: "frame", type: "IMAGE" },
  ],
  aiDoc: {
    purpose: "Generate a visually consistent next frame from a source frame using img2img with low denoise. Designed for creating first/mid/last keyframes for LTX Video.",
    skills: [
      "Generate next keyframe maintaining character/scene identity",
      "Low denoise (0.2-0.5) for consistency",
      "Same model as LocalGen (Klein 9B) — no VRAM switch",
      "Built-in negative prompt for quality",
    ],
    params: {
      denoise: "Edit strength, 0.2-0.55, default 0.35. Lower = more similar to source",
      steps: "Sampling steps, 4-20, default 8",
      cfg: "CFG scale, 1-5, default 1.2",
      seed: "Integer for reproducibility",
      negativePrompt: "What to avoid (default: blurry, distorted anatomy, etc.)",
    },
    connectsFrom: ["fs:prompt", "fs:localGenerate", "fs:nextFrame", "fs:import"],
    connectsTo: ["fs:ltxVideo", "fs:preview", "fs:nextFrame", "fs:upscale"],
    examples: [
      "LocalGen(skeleton jumping) → Next Frame('skeleton mid-air dunk', denoise 0.35) → LTX Video(first+last frame)",
      "Chain: LocalGen → Next Frame(mid) → Next Frame(last) → LTX Video",
    ],
    comfyMapping: "UNETLoader + CLIPLoader + VAELoader + LoadImage + VAEEncode + CLIPTextEncode + KSampler(denoise<1) + VAEDecode + SaveImage",
  },
});

registerNativeNode({
  type: "fs:removeBg",
  label: "Remove BG",
  icon: "✂️",
  accentColor: "#4ecdc4",
  component: "RemoveBgNode",
  description: "Remove image background using BRIA RMBG AI model. Outputs transparent PNG.",
  inputs: [
    { name: "input", type: "IMAGE" },
  ],
  outputs: [
    { name: "image", type: "IMAGE" },
  ],
  aiDoc: {
    purpose: "Remove background from any image using BRIA RMBG model via ComfyUI.",
    skills: ["Remove background from photos", "Create transparent PNGs", "Isolate subjects"],
    params: {},
    connectsFrom: ["fs:localGenerate", "fs:nanoBanana", "fs:import", "fs:nextFrame"],
    connectsTo: ["fs:preview", "fs:inpaint", "fs:img2img", "fs:ltxVideo"],
    examples: ["LocalGen(portrait) → Remove BG → Preview (transparent)"],
    comfyMapping: "LoadImage + BriaRemoveImageBackground + SaveImage",
  },
});

registerNativeNode({
  type: "fs:inpaint",
  label: "Inpaint",
  icon: "🎭",
  accentColor: "#ab47bc",
  component: "InpaintNode",
  description: "Edit specific areas of an image using a mask. Draw mask directly or connect from Remove BG.",
  inputs: [
    { name: "prompt", type: "TEXT" },
    { name: "input", type: "IMAGE" },
    { name: "mask", type: "IMAGE" },
  ],
  outputs: [
    { name: "image", type: "IMAGE" },
  ],
  aiDoc: {
    purpose: "Inpaint (edit) masked areas of an image. Draw mask with built-in brush tool or connect auto-generated mask.",
    skills: [
      "Replace clothing, objects, backgrounds",
      "Built-in mask drawing canvas with brush/eraser",
      "Accept mask from Remove BG or SAM",
      "Adjustable denoise for subtle to full changes",
    ],
    params: {
      denoise: "Edit strength, 0.5-1.0, default 0.85",
      steps: "Sampling steps, 4-20, default 8",
      cfg: "CFG scale, 1-5, default 1.0",
      seed: "Integer for reproducibility",
    },
    connectsFrom: ["fs:prompt", "fs:localGenerate", "fs:import", "fs:removeBg"],
    connectsTo: ["fs:preview", "fs:upscale", "fs:nextFrame", "fs:ltxVideo"],
    examples: [
      "LocalGen(person) + 🖌️ mask on shirt → Inpaint('red hoodie') → Preview",
      "Import(photo) + Remove BG(mask) → Inpaint('beach sunset background') → Preview",
    ],
    comfyMapping: "UNETLoader + CLIPLoader + VAELoader + LoadImage + LoadImageMask + VAEEncode + SetLatentNoiseMask + CLIPTextEncode + KSampler + VAEDecode + SaveImage",
  },
});

registerNativeNode({
  type: "fs:compare",
  label: "A/B Compare",
  icon: "⚖️",
  accentColor: "#78909c",
  component: "CompareNode",
  description: "Compare two images side-by-side with a draggable slider. Connect any two image outputs to see differences.",
  inputs: [
    { name: "image_a", type: "IMAGE" },
    { name: "image_b", type: "IMAGE" },
  ],
  outputs: [],
  aiDoc: {
    purpose: "Visual A/B comparison of two images with interactive slider.",
    skills: ["Compare before/after", "Compare different models", "Compare settings"],
    params: {},
    connectsFrom: ["fs:localGenerate", "fs:nanoBanana", "fs:upscale", "fs:inpaint", "fs:kontext", "fs:img2img", "fs:nextFrame", "fs:removeBg", "fs:import"],
    examples: ["LocalGen → Compare ← Upscale", "Before → Compare ← After Inpaint"],
  },
});

registerNativeNode({
  type: "fs:enhance",
  label: "Quality",
  icon: "✨",
  accentColor: "#ffd54f",
  component: "EnhanceNode",
  description: "AI image quality improvement using SUPIR. Adds detail, sharpness, removes artifacts and noise. ⚠ Heavy: ~12 GB VRAM (SDXL+SUPIR) — pushes FLUX.2 out of memory and triggers slow swap on next FLUX run. For batch work with FLUX, run all FLUX generations first, then process images through SUPIR in a second pass. For lightweight upscaling stay on Upscale (UltraSharp/RealESRGAN).",
  inputs: [
    { name: "input", type: "IMAGE" },
  ],
  outputs: [
    { name: "image", type: "IMAGE" },
  ],
  aiDoc: {
    purpose: "Enhance image quality using SUPIR AI model. Upscales and adds realistic detail.",
    skills: ["Remove blur and noise", "Add fine detail", "Upscale with AI restoration", "Color correction"],
    params: {
      scale: "Upscale factor, 1-4, default 2",
      steps: "Enhancement steps, 10-50, default 20",
      restoration: "Restoration strength, 0-1, default 0.5",
      cfg: "CFG scale, 1-10, default 4",
      colorFix: "None / AdaIn / Wavelet",
    },
    connectsFrom: ["fs:localGenerate", "fs:nanoBanana", "fs:import", "fs:kontext", "fs:inpaint", "fs:nextFrame"],
    connectsTo: ["fs:preview", "fs:compare", "fs:ltxVideo"],
    examples: ["LocalGen(blurry) → Enhance(SUPIR 2x) → Compare ← original"],
    comfyMapping: "SUPIR_Upscale + SaveImage",
  },
});

registerNativeNode({
  type: "fs:controlNet",
  label: "ControlNet",
  icon: "🎯",
  accentColor: "#26a69a",
  component: "ControlNetNode",
  description: "Structure-guided generation using ControlNet Union Pro 2.0. Preserve edges, depth, pose, or lineart from a reference image.",
  inputs: [
    { name: "prompt", type: "TEXT" },
    { name: "input", type: "IMAGE" },
  ],
  outputs: [
    { name: "image", type: "IMAGE" },
  ],
  aiDoc: {
    purpose: "Generate images guided by a reference structure using ControlNet Union Pro 2.0. Supports canny edges, lineart, depth, openpose, tile, segment, and scribble modes.",
    skills: ["Preserve object structure in generation", "Edge-guided generation (canny)", "Pose-guided generation (openpose)", "Depth-guided generation", "Lineart-guided generation", "Tile-based upscaling", "Segmentation-guided generation"],
    params: {
      controlType: "canny | soft_edge | depth | pose | gray",
      strength: "ControlNet influence, 0.05-1.5, default 0.7",
      startPercent: "When ControlNet starts, 0-1, default 0",
      endPercent: "When ControlNet stops, 0-1, default 1",
      cannyLow: "Canny low threshold, 10-300, default 100",
      cannyHigh: "Canny high threshold, 50-500, default 200",
      steps: "Sampling steps, 1-30, default 4",
      cfg: "CFG scale, 1-20, default 1.0",
    },
    connectsFrom: ["fs:prompt", "fs:import", "fs:localGenerate", "fs:removeBg", "fs:upscale"],
    connectsTo: ["fs:preview", "fs:compare", "fs:upscale", "fs:enhance"],
    examples: ["Prompt + Reference → ControlNet(canny) → Preview", "Photo → ControlNet(depth) → new scene with same composition"],
    comfyMapping: "UNETLoader + DualCLIPLoader + VAELoader + Canny + ControlNetLoader + FluxGuidance + ControlNetApplyAdvanced + KSampler + VAEDecode + SaveImage",
  },
});

registerNativeNode({
  type: "fs:inpaintCN",
  label: "Inpaint+CN",
  icon: "🎯",
  accentColor: "#26a69a",
  component: "InpaintCNNode",
  description: "Inpaint with ControlNet structure guidance. Paints inside mask while preserving structure from the original image.",
  inputs: [
    { name: "prompt", type: "TEXT" },
    { name: "input", type: "IMAGE" },
    { name: "mask", type: "IMAGE" },
  ],
  outputs: [
    { name: "image", type: "IMAGE" },
  ],
  aiDoc: {
    purpose: "Combined Inpaint + ControlNet in a single pass. FLUX.1 Fill inpaints the masked area while ControlNet Union Pro 2.0 ensures the result matches the original structure (edges, depth, pose).",
    skills: ["Inpaint while preserving object structure", "Add textures without changing shape", "Modify appearance in masked area with structural guidance"],
    params: {
      controlType: "canny | soft_edge | depth | pose | gray",
      cnStrength: "ControlNet influence, 0.05-1.5, default 0.7",
      cnEndPercent: "When CN stops, 0-1, default 0.8",
      guidance: "FLUX guidance, 1-50, default 30",
      denoise: "Denoise strength, 0.05-1.0, default 0.85",
      steps: "Sampling steps, default 20",
    },
    connectsFrom: ["fs:prompt", "fs:import", "fs:localGenerate", "fs:kontext"],
    connectsTo: ["fs:preview", "fs:compare", "fs:upscale", "fs:enhance"],
    examples: ["Photo of ball → mask mud areas → Inpaint+CN(canny) → ball with mud, seams preserved"],
    comfyMapping: "FLUX.1 Fill + ControlNet Union Pro 2.0 + FluxGuidance + DifferentialDiffusion + InpaintModelConditioning + ControlNetApplyAdvanced",
  },
});

registerNativeNode({
  type: "fs:wanVideo",
  label: "Wan Video",
  icon: "🎥",
  accentColor: "#42a5f5",
  component: "WanVideoNode",
  description: "Generate video from image + prompt using Wan 2.2 TI2V-5B. Fast lightweight video generation.",
  inputs: [
    { name: "prompt", type: "TEXT" },
    { name: "start_image", type: "IMAGE" },
  ],
  outputs: [
    { name: "video", type: "VIDEO" },
  ],
  aiDoc: {
    purpose: "Generate video from a text prompt with optional start image using Wan 2.2 TI2V-5B model (GGUF Q8). Supports text-to-video and image-to-video in a single lightweight model.",
    skills: ["Text to video generation", "Image to video animation", "Prompt-guided video creation"],
    params: {
      steps: "Sampling steps, 10-50, default 30",
      cfg: "CFG scale, 1-15, default 6.0",
      shift: "Flow shift, 0-20, default 5.0",
      numFrames: "Number of frames, 1-129, default 49 (step 4)",
      fps: "Frames per second, 8-30, default 16",
      width: "Video width, default 832",
      height: "Video height, default 480",
      noiseAug: "Noise augmentation for more motion, 0-1, default 0",
    },
    connectsFrom: ["fs:prompt", "fs:import", "fs:localGenerate", "fs:kontext"],
    connectsTo: ["fs:preview"],
    examples: ["Prompt('a cat walking') → Wan Video → Preview", "LocalGen(cat) → Wan Video + Prompt('cat running') → Preview"],
    comfyMapping: "WanVideoModelLoader(TI2V-5B) + WanVideoVAELoader + LoadWanVideoT5TextEncoder + WanVideoTextEncode + WanVideoImageToVideoEncode + WanVideoSampler + WanVideoDecode + SaveVideo",
  },
});

registerNativeNode({
  type: "fs:wanAnimate",
  label: "Wan Animate",
  icon: "🕺",
  accentColor: "#ff7043",
  component: "WanAnimateNode",
  description: "Transfer motion from video to character image, or replace a person in video. Wan 2.2 Animate 14B.",
  inputs: [
    { name: "prompt", type: "TEXT" },
    { name: "ref_image", type: "IMAGE" },
    { name: "pose_video", type: "VIDEO" },
  ],
  outputs: [
    { name: "video", type: "VIDEO" },
  ],
  aiDoc: {
    purpose: "Character animation and replacement using Wan 2.2 Animate 14B. Two modes: Animation (transfer poses from driving video to character image) and Replacement (replace person in video with character).",
    skills: ["Motion transfer from video to character", "Character animation from pose video", "Person replacement in video", "Dance transfer to custom character"],
    params: {
      mode: "animate (motion transfer) | replace (character replacement)",
      steps: "Sampling steps, 10-50, default 30",
      cfg: "CFG scale, 1-15, default 6.0",
      shift: "Flow shift, 0-20, default 5.0",
      numFrames: "Number of frames, 1-129, default 81 (step 4)",
      poseStrength: "Pose influence, 0-2, default 1.0",
      faceStrength: "Face influence, 0-2, default 1.0",
    },
    connectsFrom: ["fs:prompt", "fs:import", "fs:localGenerate", "fs:kontext", "fs:ltxVideo"],
    connectsTo: ["fs:preview"],
    examples: ["Character image + Dance video → Wan Animate(motion) → character dancing", "Character image + Person video → Wan Animate(replace) → person replaced"],
    comfyMapping: "WanVideoModelLoader(Animate-14B) + WanVideoBlockSwap + WanVideoVAELoader + LoadWanVideoT5TextEncoder + CLIPVisionLoader + WanVideoClipVisionEncode + WanVideoAnimateEmbeds + WanVideoSampler + WanVideoDecode + SaveVideo",
  },
});

registerNativeNode({
  type: "fs:hunyuanVideo",
  label: "HunyuanVideo",
  icon: "🌊",
  accentColor: "#29b6f6",
  component: "HunyuanVideoNode",
  description: "Generate video from image + prompt using HunyuanVideo 1.5. High quality T2V/I2V with low VRAM usage.",
  inputs: [
    { name: "prompt", type: "TEXT" },
    { name: "start_image", type: "IMAGE" },
  ],
  outputs: [
    { name: "video", type: "VIDEO" },
  ],
  aiDoc: {
    purpose: "Generate video from text prompt with optional start image using HunyuanVideo 1.5 (GGUF Q8). Supports T2V and I2V. Text encoder auto-downloads on first run.",
    skills: ["Text to video generation", "Image to video animation", "High quality video at lower VRAM"],
    params: {
      steps: "Sampling steps, 10-50, default 30",
      cfg: "Embedded guidance scale, 1-15, default 6.0",
      flowShift: "Flow shift, 0-20, default 9.0",
      numFrames: "Number of frames, 1-129, default 49 (step 4)",
      fps: "Frames per second, 8-30, default 24",
      width: "Video width, default 512",
      height: "Video height, default 320",
      denoise: "Denoise strength, 0.1-1.0, default 1.0",
    },
    connectsFrom: ["fs:prompt", "fs:import", "fs:localGenerate", "fs:kontext"],
    connectsTo: ["fs:preview"],
    examples: ["Prompt('ocean waves at sunset') → HunyuanVideo → Preview", "LocalGen(landscape) → HunyuanVideo + Prompt('camera pan') → Preview"],
    comfyMapping: "HyVideoModelLoader + HyVideoVAELoader + DownloadAndLoadHyVideoTextEncoder + HyVideoI2VEncode/HyVideoTextEncode + HyVideoSampler + HyVideoDecode + SaveVideo",
  },
});

registerNativeNode({
  type: "fs:hunyuanAvatar",
  label: "HunyuanAvatar",
  icon: "🗣",
  accentColor: "#ab47bc",
  component: "HunyuanAvatarNode",
  description: "Audio-driven talking head video. Feed a portrait image + audio to generate a speaking/singing character.",
  inputs: [
    { name: "prompt", type: "TEXT" },
    { name: "image", type: "IMAGE" },
    { name: "audio", type: "AUDIO" },
  ],
  outputs: [
    { name: "video", type: "VIDEO" },
  ],
  aiDoc: {
    purpose: "Generate talking head video from a portrait image and audio using HunyuanVideo-Avatar. The character will speak/sing synchronized to the audio input.",
    skills: ["Audio-driven talking head", "Lip sync video generation", "Character animation from speech", "Singing avatar creation"],
    params: {
      steps: "Sampling steps, 10-50, default 25",
      cfg: "CFG scale, 1-15, default 7.5",
      duration: "Audio duration to process, 1-30s, default 5",
      width: "Video width, 128-1216, default 512",
      height: "Video height, 128-1216, default 512",
      faceSize: "Face crop size multiplier, 0.5-10, default 3.0",
      objectName: "Subject description, e.g. 'girl', 'man'",
      videoLength: "Frame count, 128-512, default 128",
    },
    connectsFrom: ["fs:prompt", "fs:import", "fs:localGenerate", "fs:tts", "fs:music"],
    connectsTo: ["fs:preview"],
    examples: ["Portrait + TTS audio → HunyuanAvatar → talking head video", "Character image + song → HunyuanAvatar → singing avatar"],
    comfyMapping: "HY_Avatar_Loader + LoadImage + LoadAudio + HY_Avatar_PreData + HY_Avatar_Sampler + SaveVideo",
  },
});
