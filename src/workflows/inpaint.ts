export interface InpaintParams {
  modelType: string;
  imgName: string;
  maskName: string | null;
  samMaskRef: [string, number] | null;
  prompt: string;
  seed: number;
  steps: number;
  cfg: number;
  denoise: number;
}

export function buildInpaintWorkflow(p: InpaintParams): Record<string, any> {
  const wf: Record<string, any> = {};
  let n = 1;

  // Load image + mask (shared across models)
  const imgLoadId = p.maskName ? String(n++) : null;
  if (imgLoadId && p.maskName) {
    wf[imgLoadId] = { class_type: "LoadImage", inputs: { image: p.imgName } };
  }
  const maskLoadId = p.maskName ? String(n++) : null;
  if (maskLoadId && p.maskName) {
    wf[maskLoadId] = { class_type: "LoadImageMask", inputs: { image: p.maskName, channel: "red" } };
  }
  const imgRef: [string, number] = imgLoadId ? [imgLoadId, 0] : ["1", 0];
  const maskRef: [string, number] = p.samMaskRef || (maskLoadId ? [maskLoadId, 0] : ["1", 0]);

  let decodeId = "";

  if (p.modelType === "flux1-fill") {
    // ═══ FLUX.1 Fill: Official workflow ═══
    // UNETLoader → DifferentialDiffusion → KSampler
    // DualCLIPLoader → CLIPTextEncode → FluxGuidance → InpaintModelConditioning
    // LoadImage → InpaintModelConditioning (noise_mask=false)
    const unetId = String(n++);
    wf[unetId] = { class_type: "UNETLoader", inputs: { unet_name: "flux1-fill-dev.safetensors", weight_dtype: "default" } };
    const diffDiffId = String(n++);
    wf[diffDiffId] = { class_type: "DifferentialDiffusion", inputs: { model: [unetId, 0] } };
    const clipId = String(n++);
    wf[clipId] = { class_type: "DualCLIPLoader", inputs: { clip_name1: "clip_l.safetensors", clip_name2: "t5xxl_fp8_e4m3fn.safetensors", type: "flux" } };
    const vaeId = String(n++);
    wf[vaeId] = { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } };
    const posId = String(n++);
    wf[posId] = { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: [clipId, 0] } };
    const negId = String(n++);
    wf[negId] = { class_type: "CLIPTextEncode", inputs: { text: "", clip: [clipId, 0] } };
    const guidanceId = String(n++);
    wf[guidanceId] = { class_type: "FluxGuidance", inputs: { conditioning: [posId, 0], guidance: 30.0 } };
    const condId = String(n++);
    wf[condId] = { class_type: "InpaintModelConditioning", inputs: { positive: [guidanceId, 0], negative: [negId, 0], vae: [vaeId, 0], pixels: imgRef, mask: maskRef, noise_mask: false } };
    const samplerId = String(n++);
    wf[samplerId] = { class_type: "KSampler", inputs: { model: [diffDiffId, 0], positive: [condId, 0], negative: [condId, 1], latent_image: [condId, 2], seed: p.seed, steps: Math.max(p.steps, 20), cfg: 1.0, sampler_name: "euler", scheduler: "normal", denoise: 1.0 } };
    decodeId = String(n++);
    wf[decodeId] = { class_type: "VAEDecode", inputs: { samples: [samplerId, 0], vae: [vaeId, 0] } };

  } else if (p.modelType === "klein-9b" || p.modelType === "klein-4b") {
    // ═══ Klein 9B/4B: SetLatentNoiseMask, denoise 1.0 ═══
    const isKlein4B = p.modelType === "klein-4b";
    const unetName = isKlein4B ? "flux-2-klein-4b.safetensors" : "flux-2-klein-9b.safetensors";
    const clipName = isKlein4B ? "qwen_3_4b_fp4_flux2.safetensors" : "qwen3_8b_klein9b.safetensors";

    const unetId = String(n++);
    wf[unetId] = { class_type: "UNETLoader", inputs: { unet_name: unetName, weight_dtype: "default" } };
    const clipId = String(n++);
    wf[clipId] = { class_type: "CLIPLoader", inputs: { clip_name: clipName, type: "flux2", device: "default" } };
    const vaeId = String(n++);
    wf[vaeId] = { class_type: "VAELoader", inputs: { vae_name: "flux2-vae.safetensors" } };
    const encId = String(n++);
    wf[encId] = { class_type: "VAEEncode", inputs: { pixels: imgRef, vae: [vaeId, 0] } };
    const maskSetId = String(n++);
    wf[maskSetId] = { class_type: "SetLatentNoiseMask", inputs: { samples: [encId, 0], mask: maskRef } };
    const textId = String(n++);
    wf[textId] = { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: [clipId, 0] } };
    const samplerId = String(n++);
    wf[samplerId] = { class_type: "KSampler", inputs: { model: [unetId, 0], positive: [textId, 0], negative: [textId, 0], latent_image: [maskSetId, 0], seed: p.seed, steps: isKlein4B ? 4 : p.steps, cfg: 1.0, sampler_name: "euler", scheduler: "simple", denoise: 1.0 } };
    decodeId = String(n++);
    wf[decodeId] = { class_type: "VAEDecode", inputs: { samples: [samplerId, 0], vae: [vaeId, 0] } };

  } else if (p.modelType === "sdxl-inpaint") {
    // ═══ SDXL Inpainting: UNETLoader for inpaint + CheckpointLoader for CLIP/VAE ═══
    const ckptId = String(n++);
    wf[ckptId] = { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sd_xl_base_1.0.safetensors" } };
    const unetId = String(n++);
    wf[unetId] = { class_type: "UNETLoader", inputs: { unet_name: "sdxl-inpainting.safetensors", weight_dtype: "default" } };
    const posId = String(n++);
    wf[posId] = { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: [ckptId, 1] } };
    const negId = String(n++);
    wf[negId] = { class_type: "CLIPTextEncode", inputs: { text: "", clip: [ckptId, 1] } };
    const condId = String(n++);
    wf[condId] = { class_type: "InpaintModelConditioning", inputs: { positive: [posId, 0], negative: [negId, 0], vae: [ckptId, 2], pixels: imgRef, mask: maskRef, noise_mask: true } };
    const samplerId = String(n++);
    wf[samplerId] = { class_type: "KSampler", inputs: { model: [unetId, 0], positive: [condId, 0], negative: [condId, 1], latent_image: [condId, 2], seed: p.seed, steps: Math.max(p.steps, 15), cfg: Math.max(p.cfg, 5), sampler_name: "euler", scheduler: "normal", denoise: 1.0 } };
    decodeId = String(n++);
    wf[decodeId] = { class_type: "VAEDecode", inputs: { samples: [samplerId, 0], vae: [ckptId, 2] } };

  } else {
    // ═══ SD 1.5 Inpainting: VAEEncodeForInpaint ═══
    const ckptId = String(n++);
    wf[ckptId] = { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sd-v1-5-inpainting.ckpt" } };
    const posId = String(n++);
    wf[posId] = { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: [ckptId, 1] } };
    const negId = String(n++);
    wf[negId] = { class_type: "CLIPTextEncode", inputs: { text: "", clip: [ckptId, 1] } };
    const encId = String(n++);
    wf[encId] = { class_type: "VAEEncodeForInpaint", inputs: { pixels: imgRef, vae: [ckptId, 2], mask: maskRef, grow_mask_by: 6 } };
    const samplerId = String(n++);
    wf[samplerId] = { class_type: "KSampler", inputs: { model: [ckptId, 0], positive: [posId, 0], negative: [negId, 0], latent_image: [encId, 0], seed: p.seed, steps: Math.max(p.steps, 20), cfg: Math.max(p.cfg, 8), sampler_name: "uni_pc_bh2", scheduler: "normal", denoise: 1.0 } };
    decodeId = String(n++);
    wf[decodeId] = { class_type: "VAEDecode", inputs: { samples: [samplerId, 0], vae: [ckptId, 2] } };
  }

  // Save result
  const saveId = String(n++);
  wf[saveId] = { class_type: "SaveImage", inputs: { images: [decodeId, 0], filename_prefix: `FS_INP_${Date.now()}` } };

  return wf;
}
