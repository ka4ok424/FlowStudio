export interface InpaintControlNetParams {
  imgName: string;
  maskName: string | null;
  samMaskRef: [string, number] | null;
  prompt: string;
  seed: number;
  steps: number;
  guidance: number;
  denoise: number;
  controlType: string;
  cnStrength: number;
  cnStartPercent: number;
  cnEndPercent: number;
  cannyLow: number;
  cannyHigh: number;
}

/**
 * Combined Inpaint + ControlNet workflow.
 *
 * Uses flux1-dev (standard, NOT Fill) with img2img approach:
 *   Source → VAEEncode → SetLatentNoiseMask(mask) → KSampler(denoise)
 *   Prompt → FluxGuidance → ControlNetApplyAdvanced → conditioning
 *
 * Why not FLUX.1 Fill:
 *   InpaintModelConditioning produces special conditioning format
 *   that ControlNetApplyAdvanced destroys — result is always identical to source.
 *
 * This approach: denoise controls how much changes, mask controls where,
 * ControlNet controls structure. All three work independently.
 */
export function buildInpaintControlNetWorkflow(p: InpaintControlNetParams): Record<string, any> {
  const wf: Record<string, any> = {};
  let n = 1;

  // flux1-dev (standard FLUX.1, NOT Fill — Fill's conditioning is incompatible with CN)
  const unetId = String(n++);
  wf[unetId] = { class_type: "UNETLoader", inputs: { unet_name: "flux1-dev.safetensors", weight_dtype: "default" } };
  const clipId = String(n++);
  wf[clipId] = { class_type: "DualCLIPLoader", inputs: { clip_name1: "t5xxl_fp8_e4m3fn.safetensors", clip_name2: "clip_l.safetensors", type: "flux" } };
  const vaeId = String(n++);
  wf[vaeId] = { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } };

  // Load source image
  const imgLoadId = String(n++);
  wf[imgLoadId] = { class_type: "LoadImage", inputs: { image: p.imgName } };

  // Load mask and convert RGB→mask (our MaskCanvas exports white=inpaint as RGB, not alpha)
  let maskForLatent: [string, number];
  if (p.samMaskRef) {
    maskForLatent = p.samMaskRef;
  } else if (p.maskName) {
    const maskLoadId = String(n++);
    wf[maskLoadId] = { class_type: "LoadImage", inputs: { image: p.maskName } };
    // ImageToMask extracts red channel: white(255)=inpaint, black(0)=keep
    const toMaskId = String(n++);
    wf[toMaskId] = { class_type: "ImageToMask", inputs: { image: [maskLoadId, 0], channel: "red" } };
    maskForLatent = [toMaskId, 0];
  } else {
    maskForLatent = [imgLoadId, 1];
  }

  // VAE encode source → latent, apply noise mask
  const encodeId = String(n++);
  wf[encodeId] = { class_type: "VAEEncode", inputs: { pixels: [imgLoadId, 0], vae: [vaeId, 0] } };
  const setMaskId = String(n++);
  wf[setMaskId] = { class_type: "SetLatentNoiseMask", inputs: { samples: [encodeId, 0], mask: maskForLatent } };

  // Preprocessor for ControlNet
  let controlImageRef: [string, number] = [imgLoadId, 0];
  if (p.controlType === "canny") {
    const cannyId = String(n++);
    wf[cannyId] = { class_type: "Canny", inputs: {
      image: [imgLoadId, 0],
      low_threshold: Math.min(p.cannyLow, 0.99),
      high_threshold: Math.min(p.cannyHigh, 0.99),
    }};
    controlImageRef = [cannyId, 0];
  }

  // ControlNet Union Pro 2.0
  const cnLoadId = String(n++);
  wf[cnLoadId] = { class_type: "ControlNetLoader", inputs: { control_net_name: "flux-controlnet-union-pro-2.safetensors" } };

  // Text encode → FluxGuidance
  const posId = String(n++);
  wf[posId] = { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: [clipId, 0] } };
  const guidanceId = String(n++);
  wf[guidanceId] = { class_type: "FluxGuidance", inputs: { conditioning: [posId, 0], guidance: p.guidance } };
  const negId = String(n++);
  wf[negId] = { class_type: "CLIPTextEncode", inputs: { text: "", clip: [clipId, 0] } };

  // ControlNet modifies standard conditioning (no InpaintModelConditioning conflict)
  const cnApplyId = String(n++);
  wf[cnApplyId] = {
    class_type: "ControlNetApplyAdvanced",
    inputs: {
      positive: [guidanceId, 0], negative: [negId, 0],
      control_net: [cnLoadId, 0], image: controlImageRef,
      vae: [vaeId, 0],
      strength: p.cnStrength,
      start_percent: p.cnStartPercent,
      end_percent: p.cnEndPercent,
    },
  };

  // KSampler — denoise controls how much changes in masked area
  const samplerId = String(n++);
  wf[samplerId] = {
    class_type: "KSampler",
    inputs: {
      model: [unetId, 0],
      positive: [cnApplyId, 0], negative: [cnApplyId, 1],
      latent_image: [setMaskId, 0],
      seed: p.seed, steps: p.steps, cfg: 1.0,
      sampler_name: "euler", scheduler: "simple",
      denoise: p.denoise,
    },
  };

  // VAE Decode + Save
  const decodeId = String(n++);
  wf[decodeId] = { class_type: "VAEDecode", inputs: { samples: [samplerId, 0], vae: [vaeId, 0] } };
  const saveId = String(n++);
  wf[saveId] = { class_type: "SaveImage", inputs: { images: [decodeId, 0], filename_prefix: `FS_IPCN_${Date.now()}` } };

  return wf;
}
