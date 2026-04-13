export interface LocalGenParams {
  model: string;
  prompt: string;
  seed: number;
  steps: number;
  cfg: number;
  width: number;
  height: number;
}

export function buildLocalGenWorkflow(p: LocalGenParams): Record<string, any> {
  const modelLower = p.model.toLowerCase();
  const isKlein = modelLower.includes("klein");
  const isKlein9B = isKlein && modelLower.includes("9b");
  const isFlux2Dev = !isKlein && (modelLower.includes("flux2-dev") || (modelLower.includes("flux2") && modelLower.includes("dev")));
  const isFlux2 = modelLower.includes("flux-2") || modelLower.includes("flux2") || isKlein;
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

  if (isFlux2) {
    let clipNode: Record<string, any>;
    if (isKlein9B) {
      clipNode = { class_type: "CLIPLoader", inputs: { clip_name: "qwen3_8b_klein9b.safetensors", type: "flux2", device: "default" } };
    } else if (isFlux2Dev) {
      clipNode = { class_type: "CLIPLoader", inputs: { clip_name: "mistral_3_small_flux2_fp8.safetensors", type: "flux2", device: "default" } };
    } else {
      clipNode = { class_type: "CLIPLoader", inputs: { clip_name: "qwen_3_4b_fp4_flux2.safetensors", type: "flux2", device: "default" } };
    }
    const vaeModel = "flux2-vae.safetensors";

    return {
      "1": { class_type: "UNETLoader", inputs: { unet_name: p.model, weight_dtype: "default" } },
      "2": clipNode,
      "3": { class_type: "VAELoader", inputs: { vae_name: vaeModel } },
      "4": { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: ["2", 0] } },
      "5": { class_type: "EmptySD3LatentImage", inputs: { width: p.width, height: p.height, batch_size: 1 } },
      "6": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["4", 0], negative: ["4", 0], latent_image: ["5", 0], seed: p.seed, steps: p.steps, cfg: isKlein ? 1.0 : p.cfg, sampler_name: "euler", scheduler: "simple", denoise: 1.0 } },
      "7": { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["3", 0] } },
      "8": { class_type: "SaveImage", inputs: { images: ["7", 0], filename_prefix: `FS_${Date.now()}` } },
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
