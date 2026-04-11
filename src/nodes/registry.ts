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

registerNativeNode({
  type: "fs:multiRef",
  label: "Multi Reference",
  icon: "🔗",
  accentColor: "#26c6da",
  component: "MultiRefNode",
  description: "Combine multiple reference images into one using IP-Adapter. Add style reference for visual consistency.",
  inputs: [
    { name: "prompt", type: "TEXT" },
    { name: "ref_0", type: "IMAGE" },
    { name: "style_ref", type: "IMAGE" },
  ],
  outputs: [{ name: "image", type: "IMAGE" }],
  aiDoc: {
    purpose: "Multi-reference image generation via chained Flux IP-Adapter. Each reference image influences the output. Style ref controls visual style separately.",
    skills: [
      "Combine multiple characters into one scene",
      "Apply visual style from reference",
      "IP-Adapter multi-reference generation",
    ],
    params: {
      model: "Checkpoint model",
      width: "Output width, default 1024",
      height: "Output height, default 1024",
      steps: "Sampling steps, default 4",
      cfg: "CFG scale, default 7",
      ipWeight: "IP-Adapter weight for content refs, default 0.7",
      styleWeight: "IP-Adapter weight for style ref, default 0.3",
      _refCount: "Number of reference inputs (1-8)",
    },
    connectsFrom: ["fs:prompt", "fs:localGenerate", "fs:nanoBanana", "fs:import", "fs:characterCard"],
    connectsTo: ["fs:preview", "fs:scene", "fs:storyboard"],
    examples: [
      "Connect 3 character portraits + Prompt('group photo in a park') → combined scene",
      "Connect style image to Style input → output matches visual style",
    ],
  },
});

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
