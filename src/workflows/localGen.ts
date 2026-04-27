export interface LocalGenParams {
  model: string;
  prompt: string;
  seed: number;
  steps: number;
  cfg: number;
  width: number;
  height: number;
}

export interface ModelDefaults {
  steps: number;
  cfg: number;
  family: "klein" | "dev" | "z-image" | "sd";
  label: string;
}

/** Recommended generation settings for a given checkpoint family.
 * Klein is step-distilled (4 steps, cfg=1 — no CFG guidance possible).
 * Dev (Flux 1 / Flux 2) is full-transformer (20-30 steps, cfg=3.5 via FluxGuidance).
 * Z-Image-Turbo is step-distilled (8 steps, cfg=1, res_multistep sampler). */
export function getModelDefaults(model: string): ModelDefaults {
  const m = (model || "").toLowerCase();
  if (m.includes("klein")) {
    return { steps: 4, cfg: 1.0, family: "klein", label: "Klein (distilled)" };
  }
  if (m.includes("z_image") || m.includes("z-image")) {
    return { steps: 8, cfg: 1.0, family: "z-image", label: "Z-Image Turbo (distilled)" };
  }
  if (m.includes("flux") && m.includes("dev")) {
    return { steps: 25, cfg: 3.5, family: "dev", label: "Flux Dev (full)" };
  }
  // Default for SD/SDXL/SD3/etc
  return { steps: 20, cfg: 7.0, family: "sd", label: "Standard checkpoint" };
}

export function buildLocalGenWorkflow(p: LocalGenParams): Record<string, any> {
  // Sanitize dimensions defensively: ComfyUI's EmptySD3LatentImage and
  // EmptyFlux2LatentImage require min 16, step 16. Snap to multiples of 64
  // (which is the typical user-facing step and is divisible by 16).
  const sanitizeDim = (v: number) => {
    const n = Math.round((Number.isFinite(v) ? v : 1024) / 64) * 64;
    return Math.max(64, Math.min(2048, n));
  };
  p = { ...p, width: sanitizeDim(p.width), height: sanitizeDim(p.height) };
  const modelLower = p.model.toLowerCase();
  const isKlein = modelLower.includes("klein");
  const isKlein9B = isKlein && modelLower.includes("9b");
  const isFlux2Dev = !isKlein && (modelLower.includes("flux2-dev") || (modelLower.includes("flux2") && modelLower.includes("dev")));
  const isFlux2 = modelLower.includes("flux-2") || modelLower.includes("flux2") || isKlein;
  // FLUX 1 base — flux1-dev.safetensors. Kontext/Fill variants are handled by
  // their dedicated nodes, not LocalGen.
  const isFlux1Dev = modelLower.includes("flux1") && !modelLower.includes("flux2")
    && !modelLower.includes("kontext") && !modelLower.includes("fill");
  const isZImage = modelLower.includes("z_image") || modelLower.includes("z-image");
  const isGGUF = modelLower.includes("gguf");

  if (isGGUF) {
    return {
      "1": { class_type: "UnetLoaderGGUF", inputs: { unet_name: p.model } },
      "2": { class_type: "DualCLIPLoader", inputs: { clip_name1: "clip_l.safetensors", clip_name2: "t5xxl_fp8_e4m3fn.safetensors", type: "flux" } },
      "3": { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } },
      "4": { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: ["2", 0] } },
      "5": { class_type: "EmptySD3LatentImage", inputs: { width: p.width, height: p.height, batch_size: 1 } },
      "6": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["4", 0], negative: ["4", 0], latent_image: ["5", 0], seed: p.seed, steps: p.steps, cfg: p.cfg, sampler_name: "euler", scheduler: "simple", denoise: 1.0 } },
      "7": { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["3", 0] } },
      "8": { class_type: "SaveImage", inputs: { images: ["7", 0], filename_prefix: `FS_${Date.now()}` } },
    };
  }

  // ═══ Z-Image-Turbo (Alibaba Tongyi, distilled 6B, Qwen3-4B encoder, lumina2 type) ═══
  if (isZImage) {
    return {
      "1": { class_type: "UNETLoader", inputs: { unet_name: p.model, weight_dtype: "default" } },
      "2": { class_type: "CLIPLoader", inputs: { clip_name: "qwen_3_4b.safetensors", type: "lumina2" } },
      "3": { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } },
      "4": { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: ["2", 0] } },
      "5": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["4", 0] } },
      "6": { class_type: "EmptySD3LatentImage", inputs: { width: p.width, height: p.height, batch_size: 1 } },
      "7": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["4", 0], negative: ["5", 0], latent_image: ["6", 0], seed: p.seed, steps: p.steps, cfg: 1.0, sampler_name: "res_multistep", scheduler: "simple", denoise: 1.0 } },
      "8": { class_type: "VAEDecode", inputs: { samples: ["7", 0], vae: ["3", 0] } },
      "9": { class_type: "SaveImage", inputs: { images: ["8", 0], filename_prefix: `FS_${Date.now()}` } },
    };
  }

  // ═══ FLUX 1 Dev (UNETLoader safetensors + DualCLIPLoader clip_l + t5xxl) ═══
  if (isFlux1Dev) {
    return {
      "1": { class_type: "UNETLoader", inputs: { unet_name: p.model, weight_dtype: "default" } },
      "2": { class_type: "DualCLIPLoader", inputs: { clip_name1: "clip_l.safetensors", clip_name2: "t5xxl_fp8_e4m3fn.safetensors", type: "flux" } },
      "3": { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } },
      "4": { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: ["2", 0] } },
      "5": { class_type: "FluxGuidance", inputs: { conditioning: ["4", 0], guidance: p.cfg } },
      "6": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["4", 0] } },
      "7": { class_type: "EmptySD3LatentImage", inputs: { width: p.width, height: p.height, batch_size: 1 } },
      "8": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["5", 0], negative: ["6", 0], latent_image: ["7", 0], seed: p.seed, steps: p.steps, cfg: 1.0, sampler_name: "euler", scheduler: "simple", denoise: 1.0 } },
      "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["3", 0] } },
      "10": { class_type: "SaveImage", inputs: { images: ["9", 0], filename_prefix: `FS_${Date.now()}` } },
    };
  }

  // ═══ FLUX 2 Dev (official workflow: FluxGuidance + ConditioningZeroOut + EmptyFlux2LatentImage) ═══
  if (isFlux2Dev) {
    return {
      "1": { class_type: "UNETLoader", inputs: { unet_name: p.model, weight_dtype: "default" } },
      "2": { class_type: "CLIPLoader", inputs: { clip_name: "mistral_3_small_flux2_fp8.safetensors", type: "flux2", device: "cpu" } },
      "3": { class_type: "VAELoader", inputs: { vae_name: "flux2-vae.safetensors" } },
      "4": { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: ["2", 0] } },
      "5": { class_type: "FluxGuidance", inputs: { conditioning: ["4", 0], guidance: p.cfg } },
      "6": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["4", 0] } },
      "7": { class_type: "EmptyFlux2LatentImage", inputs: { width: p.width, height: p.height, batch_size: 1 } },
      "8": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["5", 0], negative: ["6", 0], latent_image: ["7", 0], seed: p.seed, steps: p.steps, cfg: 1.0, sampler_name: "euler", scheduler: "simple", denoise: 1.0 } },
      "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["3", 0] } },
      "10": { class_type: "SaveImage", inputs: { images: ["9", 0], filename_prefix: `FS_${Date.now()}` } },
    };
  }

  // ═══ FLUX 2 Klein (simpler workflow, cfg=1.0 built-in) ═══
  if (isFlux2) {
    let clipNode: Record<string, any>;
    if (isKlein9B) {
      clipNode = { class_type: "CLIPLoader", inputs: { clip_name: "qwen3_8b_klein9b.safetensors", type: "flux2", device: "default" } };
    } else {
      clipNode = { class_type: "CLIPLoader", inputs: { clip_name: "qwen_3_4b_fp4_flux2.safetensors", type: "flux2", device: "default" } };
    }

    return {
      "1": { class_type: "UNETLoader", inputs: { unet_name: p.model, weight_dtype: "default" } },
      "2": clipNode,
      "3": { class_type: "VAELoader", inputs: { vae_name: "flux2-vae.safetensors" } },
      "4": { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: ["2", 0] } },
      "5": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["4", 0] } },
      "6": { class_type: "EmptySD3LatentImage", inputs: { width: p.width, height: p.height, batch_size: 1 } },
      "7": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["4", 0], negative: ["5", 0], latent_image: ["6", 0], seed: p.seed, steps: p.steps, cfg: 1.0, sampler_name: "euler", scheduler: "simple", denoise: 1.0 } },
      "8": { class_type: "VAEDecode", inputs: { samples: ["7", 0], vae: ["3", 0] } },
      "9": { class_type: "SaveImage", inputs: { images: ["8", 0], filename_prefix: `FS_${Date.now()}` } },
    };
  }

  // Standard SD/SDXL checkpoint
  if (modelLower.includes("sd3")) {
    return {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: p.model } },
      "2": { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: ["1", 1] } },
      "3": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["1", 1] } },
      "4": { class_type: "EmptySD3LatentImage", inputs: { width: p.width, height: p.height, batch_size: 1 } },
      "5": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0], seed: p.seed, steps: p.steps, cfg: p.cfg, sampler_name: "euler", scheduler: "simple", denoise: 1.0 } },
      "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
      "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: `FS_${Date.now()}` } },
    };
  }

  // Default: standard checkpoint
  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: p.model } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: ["1", 1] } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["1", 1] } },
    "4": { class_type: "EmptyLatentImage", inputs: { width: p.width, height: p.height, batch_size: 1 } },
    "5": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0], seed: p.seed, steps: p.steps, cfg: p.cfg, sampler_name: "euler", scheduler: "normal", denoise: 1.0 } },
    "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: `FS_${Date.now()}` } },
  };
}
