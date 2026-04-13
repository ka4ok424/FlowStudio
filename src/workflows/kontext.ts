export interface KontextParams {
  imageName: string;
  prompt: string;
  seed: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  width: number;
  height: number;
}

export function buildKontextWorkflow(p: KontextParams): Record<string, any> {
  return {
    "1": { class_type: "UNETLoader", inputs: { unet_name: "flux1-kontext-dev.safetensors", weight_dtype: "default" } },
    "2": { class_type: "DualCLIPLoader", inputs: { clip_name1: "clip_l.safetensors", clip_name2: "t5xxl_fp8_e4m3fn.safetensors", type: "flux" } },
    "3": { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } },
    "4": { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: ["2", 0] } },
    "5": { class_type: "LoadImage", inputs: { image: p.imageName } },
    "6": { class_type: "FluxKontextImageScale", inputs: { image: ["5", 0] } },
    "7": { class_type: "VAEEncode", inputs: { pixels: ["6", 0], vae: ["3", 0] } },
    "8": { class_type: "ReferenceLatent", inputs: { conditioning: ["4", 0], latent: ["7", 0] } },
    "9": { class_type: "EmptySD3LatentImage", inputs: { width: p.width, height: p.height, batch_size: 1 } },
    "10": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0], positive: ["8", 0], negative: ["8", 0],
        latent_image: ["9", 0], seed: p.seed, steps: p.steps, cfg: p.cfg,
        sampler_name: p.sampler, scheduler: p.scheduler, denoise: 1.0,
      },
    },
    "11": { class_type: "VAEDecode", inputs: { samples: ["10", 0], vae: ["3", 0] } },
    "12": { class_type: "SaveImage", inputs: { images: ["11", 0], filename_prefix: `FS_KTX_${Date.now()}` } },
  };
}
