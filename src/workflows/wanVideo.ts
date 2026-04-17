export interface WanVideoParams {
  prompt: string;
  negativePrompt: string;
  seed: number;
  steps: number;
  cfg: number;
  shift: number;
  width: number;
  height: number;
  numFrames: number;
  fps: number;
  startImageName: string | null;
  noiseAugStrength: number;
}

/**
 * Build ComfyUI workflow for Wan 2.2 TI2V-5B (text + image → video).
 *
 * Uses standard ComfyUI nodes (official Comfy-Org template).
 * Model: wan2.2_ti2v_5B_fp16.safetensors loaded via UNETLoader.
 * TI2V conditions on start image via latent space (Wan22ImageToVideoLatent, 48-ch).
 * Text encoding via CLIPLoader(type="wan") + CLIPTextEncode.
 * ModelSamplingSD3 for shift scheduling + standard KSampler + VAEDecode.
 *
 * NOTE: GGUF models are NOT compatible — UNETLoader requires safetensors.
 * WanVideoWrapper nodes (WANVIDEOMODEL/WANVAE types) create 96-ch latents
 * incompatible with TI2V-5B's 48-ch VAE.
 */
export function buildWanVideoWorkflow(p: WanVideoParams): Record<string, any> {
  const workflow: Record<string, any> = {};
  let n = 1;

  // 1. Load diffusion model → MODEL
  const modelId = String(n++);
  workflow[modelId] = {
    class_type: "UNETLoader",
    inputs: {
      unet_name: "wan2.2_ti2v_5B_fp16.safetensors",
      weight_dtype: "default",
    },
  };

  // 2. ModelSamplingSD3 for shift scheduling → MODEL
  const shiftId = String(n++);
  workflow[shiftId] = {
    class_type: "ModelSamplingSD3",
    inputs: {
      model: [modelId, 0],
      shift: p.shift,
    },
  };

  // 3. Load CLIP (UMT5-XXL, type "wan") → CLIP
  const clipId = String(n++);
  workflow[clipId] = {
    class_type: "CLIPLoader",
    inputs: {
      clip_name: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
      type: "wan",
    },
  };

  // 4. Text encode (positive + negative) → CONDITIONING
  const posId = String(n++);
  workflow[posId] = {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: [clipId, 0],
      text: p.prompt,
    },
  };

  const negId = String(n++);
  workflow[negId] = {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: [clipId, 0],
      text: p.negativePrompt,
    },
  };

  // 5. Load VAE → VAE
  const vaeId = String(n++);
  workflow[vaeId] = {
    class_type: "VAELoader",
    inputs: { vae_name: "Wan2.2_VAE.pth" },
  };

  // 6. Create video latent (48-ch, start image encoded in first frame)
  const latentInputs: Record<string, any> = {
    vae: [vaeId, 0],
    width: p.width,
    height: p.height,
    length: p.numFrames,
    batch_size: 1,
  };

  if (p.startImageName) {
    const loadImgId = String(n++);
    workflow[loadImgId] = {
      class_type: "LoadImage",
      inputs: { image: p.startImageName },
    };
    latentInputs.start_image = [loadImgId, 0];
  }

  const latentId = String(n++);
  workflow[latentId] = {
    class_type: "Wan22ImageToVideoLatent",
    inputs: latentInputs,
  };

  // 7. KSampler
  const samplerId = String(n++);
  workflow[samplerId] = {
    class_type: "KSampler",
    inputs: {
      model: [shiftId, 0],
      positive: [posId, 0],
      negative: [negId, 0],
      latent_image: [latentId, 0],
      seed: p.seed,
      steps: p.steps,
      cfg: p.cfg,
      sampler_name: "uni_pc",
      scheduler: "simple",
      denoise: 1,
    },
  };

  // 8. VAE Decode → IMAGE
  const decodeId = String(n++);
  workflow[decodeId] = {
    class_type: "VAEDecode",
    inputs: {
      vae: [vaeId, 0],
      samples: [samplerId, 0],
    },
  };

  // 9. Save as video
  const createVidId = String(n++);
  workflow[createVidId] = {
    class_type: "CreateVideo",
    inputs: { images: [decodeId, 0], fps: p.fps },
  };
  const saveId = String(n++);
  workflow[saveId] = {
    class_type: "SaveVideo",
    inputs: {
      video: [createVidId, 0],
      filename_prefix: `FS_WAN_${Date.now()}`,
      format: "mp4",
      codec: "h264",
    },
  };

  return workflow;
}
