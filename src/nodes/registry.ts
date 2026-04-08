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
