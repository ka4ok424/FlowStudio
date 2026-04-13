export interface NextFrameParams {
  imageName: string;
  prompt: string;
  negativePrompt: string;
  seed: number;
  steps: number;
  cfg: number;
  denoise: number;
}

export function buildNextFrameWorkflow(p: NextFrameParams): Record<string, any> {
  return {
    "1": { class_type: "UNETLoader", inputs: { unet_name: "flux-2-klein-9b.safetensors", weight_dtype: "default" } },
    "2": { class_type: "CLIPLoader", inputs: { clip_name: "qwen3_8b_klein9b.safetensors", type: "flux2", device: "default" } },
    "3": { class_type: "VAELoader", inputs: { vae_name: "flux2-vae.safetensors" } },
    "4": { class_type: "LoadImage", inputs: { image: p.imageName } },
    "5": { class_type: "VAEEncode", inputs: { pixels: ["4", 0], vae: ["3", 0] } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: ["2", 0] } },
    "7": { class_type: "CLIPTextEncode", inputs: { text: p.negativePrompt, clip: ["2", 0] } },
    "8": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0], positive: ["6", 0], negative: ["7", 0],
        latent_image: ["5", 0], seed: p.seed, steps: p.steps, cfg: p.cfg,
        sampler_name: "euler", scheduler: "simple", denoise: p.denoise,
      },
    },
    "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["3", 0] } },
    "10": { class_type: "SaveImage", inputs: { images: ["9", 0], filename_prefix: `FS_NF_${Date.now()}` } },
  };
}
