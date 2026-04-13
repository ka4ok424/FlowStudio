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

  // Load image + mask
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
    const unetId = String(n++);
    wf[unetId] = { class_type: "UNETLoader", inputs: { unet_name: "flux1-fill-dev.safetensors", weight_dtype: "default" } };
    const clipId = String(n++);
    wf[clipId] = { class_type: "DualCLIPLoader", inputs: { clip_name1: "clip_l.safetensors", clip_name2: "t5xxl_fp8_e4m3fn.safetensors", type: "flux" } };
    const vaeId = String(n++);
    wf[vaeId] = { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } };
    const posId = String(n++);
    wf[posId] = { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: [clipId, 0] } };
    const negId = String(n++);
    wf[negId] = { class_type: "CLIPTextEncode", inputs: { text: "", clip: [clipId, 0] } };
    const condId = String(n++);
    wf[condId] = { class_type: "InpaintModelConditioning", inputs: { positive: [posId, 0], negative: [negId, 0], vae: [vaeId, 0], pixels: imgRef, mask: maskRef, noise_mask: true } };
    const samplerId = String(n++);
    wf[samplerId] = { class_type: "KSampler", inputs: { model: [unetId, 0], positive: [condId, 0], negative: [condId, 1], latent_image: [condId, 2], seed: p.seed, steps: Math.max(p.steps, 20), cfg: p.cfg, sampler_name: "euler", scheduler: "simple", denoise: 1.0 } };
    decodeId = String(n++);
    wf[decodeId] = { class_type: "VAEDecode", inputs: { samples: [samplerId, 0], vae: [vaeId, 0] } };

  } else if (p.modelType === "klein-9b" || p.modelType === "klein-4b") {
    const isKlein4B = p.modelType === "klein-4b";
    const unetName = isKlein4B ? "flux-2-klein-4b.safetensors" : "flux-2-klein-9b.safetensors";
    const clipName = isKlein4B ? "qwen_3_4b_fp4_flux2.safetensors" : "qwen3_8b_klein9b.safetensors";

    const unetId = String(n++);
    if (isKlein4B) {
      wf[unetId] = { class_type: "UNETLoader", inputs: { unet_name: unetName, weight_dtype: "default" } };
      const shiftId = String(n++);
      wf[shiftId] = { class_type: "ModelSamplingFlux", inputs: { model: [unetId, 0], max_shift: 3.0, base_shift: 0.5, width: 1024, height: 1024 } };
      var samplerModel = shiftId;
      var samplerName = "ddim";
      var schedulerName = "sgm_uniform";
    } else {
      wf[unetId] = { class_type: "UNETLoader", inputs: { unet_name: unetName, weight_dtype: "default" } };
      var samplerModel = unetId;
      var samplerName = "euler";
      var schedulerName = "simple";
    }
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
    wf[samplerId] = { class_type: "KSampler", inputs: { model: [samplerModel, 0], positive: [textId, 0], negative: [textId, 0], latent_image: [maskSetId, 0], seed: p.seed, steps: p.steps, cfg: p.cfg, sampler_name: samplerName, scheduler: schedulerName, denoise: p.denoise } };
    decodeId = String(n++);
    wf[decodeId] = { class_type: "VAEDecode", inputs: { samples: [samplerId, 0], vae: [vaeId, 0] } };

  } else {
    // SD 1.5 / SDXL Inpainting
    const ckpt = p.modelType === "sdxl-inpaint" ? "sdxl-inpainting.safetensors" : "sd-v1-5-inpainting.ckpt";
    const ckptId = String(n++);
    wf[ckptId] = { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: ckpt } };
    const encId = String(n++);
    wf[encId] = { class_type: "VAEEncodeForInpaint", inputs: { pixels: imgRef, vae: [ckptId, 2], mask: maskRef, grow_mask_by: 6 } };
    const posId = String(n++);
    wf[posId] = { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: [ckptId, 1] } };
    const negId = String(n++);
    wf[negId] = { class_type: "CLIPTextEncode", inputs: { text: "", clip: [ckptId, 1] } };
    const samplerId = String(n++);
    wf[samplerId] = { class_type: "KSampler", inputs: { model: [ckptId, 0], positive: [posId, 0], negative: [negId, 0], latent_image: [encId, 0], seed: p.seed, steps: Math.max(p.steps, 15), cfg: Math.max(p.cfg, 5), sampler_name: "euler", scheduler: "normal", denoise: p.denoise } };
    decodeId = String(n++);
    wf[decodeId] = { class_type: "VAEDecode", inputs: { samples: [samplerId, 0], vae: [ckptId, 2] } };
  }

  // Preserve Original: composite inpaint result back onto original
  if (p.maskName || p.samMaskRef) {
    const origImgId = String(n++);
    wf[origImgId] = { class_type: "LoadImage", inputs: { image: p.imgName } };
    const compositeId = String(n++);
    wf[compositeId] = { class_type: "ImageCompositeMasked", inputs: { destination: [origImgId, 0], source: [decodeId, 0], x: 0, y: 0, resize_source: true, mask: maskRef } };
    const saveId = String(n++);
    wf[saveId] = { class_type: "SaveImage", inputs: { images: [compositeId, 0], filename_prefix: `FS_INP_${Date.now()}` } };
  } else {
    const saveId = String(n++);
    wf[saveId] = { class_type: "SaveImage", inputs: { images: [decodeId, 0], filename_prefix: `FS_INP_${Date.now()}` } };
  }

  return wf;
}
