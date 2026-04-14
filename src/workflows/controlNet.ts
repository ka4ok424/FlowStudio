export interface ControlNetParams {
  imageName: string;
  prompt: string;
  seed: number;
  steps: number;
  cfg: number;
  width: number;
  height: number;
  strength: number;
  startPercent: number;
  endPercent: number;
  controlType: string; // "canny", "soft_edge", "depth", "pose", "gray"
  // Canny specific (0.01–0.99)
  cannyLow: number;
  cannyHigh: number;
}

export function buildControlNetWorkflow(p: ControlNetParams): Record<string, any> {
  const wf: Record<string, any> = {};
  let n = 1;

  // FLUX.1-dev base model (Union Pro 2.0 requires FLUX.1 architecture)
  const unetId = String(n++);
  wf[unetId] = { class_type: "UNETLoader", inputs: { unet_name: "flux1-dev.safetensors", weight_dtype: "default" } };
  const clipId = String(n++);
  wf[clipId] = { class_type: "DualCLIPLoader", inputs: { clip_name1: "t5xxl_fp8_e4m3fn.safetensors", clip_name2: "clip_l.safetensors", type: "flux" } };
  const vaeId = String(n++);
  wf[vaeId] = { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } };

  // FluxGuidance — FLUX uses embedded guidance, not KSampler CFG
  const guidanceId = String(n++);
  wf[guidanceId] = { class_type: "FluxGuidance", inputs: { conditioning: null, guidance: p.cfg } };

  // Load source image
  const imgLoadId = String(n++);
  wf[imgLoadId] = { class_type: "LoadImage", inputs: { image: p.imageName } };

  // Preprocessor based on control type
  let preprocessedRef: [string, number] = [imgLoadId, 0];
  if (p.controlType === "canny") {
    const cannyId = String(n++);
    wf[cannyId] = { class_type: "Canny", inputs: { image: [imgLoadId, 0], low_threshold: Math.min(p.cannyLow, 0.99), high_threshold: Math.min(p.cannyHigh, 0.99) } };
    preprocessedRef = [cannyId, 0];
  }
  // For depth/pose/soft_edge/gray — Pro 2.0 handles internally, pass raw image

  // Load ControlNet model (Pro 2.0 — no SetUnionControlNetType needed, mode embedding removed)
  const cnLoadId = String(n++);
  wf[cnLoadId] = { class_type: "ControlNetLoader", inputs: { control_net_name: "flux-controlnet-union-pro-2.safetensors" } };

  // Text encode
  const posId = String(n++);
  wf[posId] = { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: [clipId, 0] } };
  // Wire FluxGuidance to positive conditioning
  wf[guidanceId].inputs.conditioning = [posId, 0];

  const negId = String(n++);
  wf[negId] = { class_type: "CLIPTextEncode", inputs: { text: "", clip: [clipId, 0] } };

  // Apply ControlNet (directly from ControlNetLoader, no Union type node)
  const applyId = String(n++);
  wf[applyId] = {
    class_type: "ControlNetApplyAdvanced",
    inputs: {
      positive: [guidanceId, 0], negative: [negId, 0],
      control_net: [cnLoadId, 0], image: preprocessedRef,
      vae: [vaeId, 0],
      strength: p.strength, start_percent: p.startPercent, end_percent: p.endPercent,
    },
  };

  // Empty latent
  const latentId = String(n++);
  wf[latentId] = { class_type: "EmptySD3LatentImage", inputs: { width: p.width, height: p.height, batch_size: 1 } };

  // KSampler — cfg=1.0 (guidance handled by FluxGuidance node)
  const samplerId = String(n++);
  wf[samplerId] = {
    class_type: "KSampler",
    inputs: {
      model: [unetId, 0], positive: [applyId, 0], negative: [applyId, 1],
      latent_image: [latentId, 0], seed: p.seed, steps: p.steps, cfg: 1.0,
      sampler_name: "euler", scheduler: "simple", denoise: 1.0,
    },
  };

  // VAE Decode + Save
  const decodeId = String(n++);
  wf[decodeId] = { class_type: "VAEDecode", inputs: { samples: [samplerId, 0], vae: [vaeId, 0] } };
  const saveId = String(n++);
  wf[saveId] = { class_type: "SaveImage", inputs: { images: [decodeId, 0], filename_prefix: `FS_CN_${Date.now()}` } };

  return wf;
}
