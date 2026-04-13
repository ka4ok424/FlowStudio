export interface EnhanceParams {
  imageName: string;
  scale: number;
  steps: number;
  restoration: number;
  cfg: number;
  prompt: string;
  negPrompt: string;
  colorFix: string;
  seed: number;
}

export function buildEnhanceWorkflow(p: EnhanceParams): Record<string, any> {
  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sd_xl_base_1.0.safetensors" } },
    "2": { class_type: "SUPIR_model_loader_v2", inputs: { model: ["1", 0], clip: ["1", 1], vae: ["1", 2], supir_model: "SUPIR-v0Q_fp16.safetensors", fp8_unet: false, diffusion_dtype: "auto" } },
    "3": { class_type: "LoadImage", inputs: { image: p.imageName } },
    "4": { class_type: "ImageScaleBy", inputs: { image: ["3", 0], upscale_method: "lanczos", scale_by: p.scale } },
    "5": { class_type: "SUPIR_first_stage", inputs: { SUPIR_VAE: ["2", 1], image: ["4", 0], use_tiled_vae: true, encoder_tile_size: 512, decoder_tile_size: 64, encoder_dtype: "auto" } },
    "6": { class_type: "SUPIR_conditioner", inputs: { SUPIR_model: ["2", 0], latents: ["5", 2], positive_prompt: p.prompt, negative_prompt: p.negPrompt } },
    "7": { class_type: "SUPIR_sample", inputs: { SUPIR_model: ["2", 0], latents: ["5", 2], positive: ["6", 0], negative: ["6", 1], seed: p.seed, steps: p.steps, cfg_scale_start: p.cfg, cfg_scale_end: p.cfg, EDM_s_churn: 5, s_noise: 1.003, DPMPP_eta: 1.0, control_scale_start: p.restoration, control_scale_end: p.restoration, restore_cfg: -1.0, keep_model_loaded: true, sampler: "RestoreDPMPP2MSampler" } },
    "8": { class_type: "SUPIR_decode", inputs: { SUPIR_VAE: ["5", 0], latents: ["7", 0], use_tiled_vae: true, decoder_tile_size: 64 } },
    "9": { class_type: "SaveImage", inputs: { images: ["8", 0], filename_prefix: `FS_ENH_${Date.now()}` } },
  };
}
