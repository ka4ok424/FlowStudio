export interface Img2ImgParams {
  imageNames: string[];
  prompt: string;
  negativePrompt: string;
  seed: number;
  steps: number;
  cfg: number;
  denoise: number;
  width: number;
  height: number;
  sampler: string;
  scheduler: string;
  kvCache: boolean;
}

export function buildImg2ImgWorkflow(p: Img2ImgParams): Record<string, any> {
  const workflow: Record<string, any> = {};
  let n = 1;

  // UNETLoader — flux2-dev FP8
  const unetId = String(n++);
  workflow[unetId] = { class_type: "UNETLoader", inputs: { unet_name: "flux2_dev_fp8mixed.safetensors", weight_dtype: "default" } };

  // CLIPLoader — Mistral
  const clipId = String(n++);
  workflow[clipId] = { class_type: "CLIPLoader", inputs: { clip_name: "mistral_3_small_flux2_fp8.safetensors", type: "flux2", device: "cpu" } };

  // VAELoader
  const vaeId = String(n++);
  workflow[vaeId] = { class_type: "VAELoader", inputs: { vae_name: "flux2-vae.safetensors" } };

  // CLIPTextEncode (positive)
  const encodeId = String(n++);
  workflow[encodeId] = { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: [clipId, 0] } };

  // CLIPTextEncode (negative) — if provided
  let negEncodeId = encodeId;
  if (p.negativePrompt) {
    negEncodeId = String(n++);
    workflow[negEncodeId] = { class_type: "CLIPTextEncode", inputs: { text: p.negativePrompt, clip: [clipId, 0] } };
  }

  // Load + VAEEncode + ReferenceLatent chain for each ref image
  let lastCondId = encodeId;
  let lastCondSlot = 0;
  for (let i = 0; i < p.imageNames.length; i++) {
    const loadId = String(n++);
    workflow[loadId] = { class_type: "LoadImage", inputs: { image: p.imageNames[i] } };

    const scaleId = String(n++);
    workflow[scaleId] = { class_type: "FluxKontextImageScale", inputs: { image: [loadId, 0] } };

    const vaeEncId = String(n++);
    workflow[vaeEncId] = { class_type: "VAEEncode", inputs: { pixels: [scaleId, 0], vae: [vaeId, 0] } };

    const refLatentId = String(n++);
    workflow[refLatentId] = { class_type: "ReferenceLatent", inputs: { conditioning: [lastCondId, lastCondSlot], latent: [vaeEncId, 0] } };

    lastCondId = refLatentId;
    lastCondSlot = 0;
  }

  // EmptyLatentImage for output
  const emptyLatentId = String(n++);
  workflow[emptyLatentId] = { class_type: "EmptySD3LatentImage", inputs: { width: p.width, height: p.height, batch_size: 1 } };

  // Optional: KV Cache
  let modelId = unetId;
  if (p.kvCache && p.imageNames.length > 1) {
    const kvId = String(n++);
    workflow[kvId] = { class_type: "FluxKVCache", inputs: { model: [unetId, 0] } };
    modelId = kvId;
  }

  // KSampler
  const samplerId = String(n++);
  workflow[samplerId] = {
    class_type: "KSampler",
    inputs: {
      model: [modelId, 0], positive: [lastCondId, lastCondSlot], negative: [negEncodeId, 0],
      latent_image: [emptyLatentId, 0], seed: p.seed, steps: p.steps, cfg: p.cfg,
      sampler_name: p.sampler, scheduler: p.scheduler, denoise: p.denoise,
    },
  };

  // VAEDecode
  const decodeId = String(n++);
  workflow[decodeId] = { class_type: "VAEDecode", inputs: { samples: [samplerId, 0], vae: [vaeId, 0] } };

  // SaveImage
  const saveId = String(n++);
  workflow[saveId] = { class_type: "SaveImage", inputs: { images: [decodeId, 0], filename_prefix: `FS_I2I_${Date.now()}` } };

  return workflow;
}
