export interface WanSmoothParams {
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
  rifeMultiplier: number;
  modelName: string;
  vaeName: string;
  clipName: string;
  samplerName: string;
  scheduler: string;
}

export const SMOOTH_NEGATIVE_DEFAULT =
  "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走";

/**
 * Build ComfyUI workflow for Wan 2.2 "Smooth Workflow" style I2V on TI2V-5B.
 *
 * Architecture (adapted from "WAN 2.2 Smooth Workflow v5.0" for TI2V-5B single-model):
 *   UNETLoader → ModelSamplingSD3(shift=8)
 *     ─ KSampler (steps=6, cfg=1, euler/simple)
 *     ─ Wan22ImageToVideoLatent (start image + frames)
 *   VAEDecode → RIFE VFI (frame interpolation, multiplier=2 → smooth)
 *   → CreateVideo (fps × multiplier) → SaveVideo
 *
 * Differences from upstream Smooth Workflow:
 *  - Single-model (TI2V-5B) instead of HIGH/LOW noise split (Wan 2.2 14B not on PC)
 *  - No LoRA stack (rgthree Power Lora Loader) — add later
 *  - No MMAudio (no models on PC)
 *  - No ColorMatch / ImageScaleBy upscale chain
 *
 * RIFE smoothness: the original "smooth" effect comes mostly from RIFE VFI
 * frame interpolation between WAN-generated frames. multiplier=2 doubles FPS,
 * multiplier=4 quadruples (very smooth but VRAM heavy).
 */
export function buildWanSmoothWorkflow(p: WanSmoothParams): Record<string, any> {
  const wf: Record<string, any> = {};
  let n = 1;

  const modelId = String(n++);
  wf[modelId] = {
    class_type: "UNETLoader",
    inputs: { unet_name: p.modelName, weight_dtype: "default" },
  };

  const shiftId = String(n++);
  wf[shiftId] = {
    class_type: "ModelSamplingSD3",
    inputs: { model: [modelId, 0], shift: p.shift },
  };

  const clipId = String(n++);
  wf[clipId] = {
    class_type: "CLIPLoader",
    inputs: { clip_name: p.clipName, type: "wan" },
  };

  const posId = String(n++);
  wf[posId] = {
    class_type: "CLIPTextEncode",
    inputs: { clip: [clipId, 0], text: p.prompt },
  };

  const negId = String(n++);
  wf[negId] = {
    class_type: "CLIPTextEncode",
    inputs: { clip: [clipId, 0], text: p.negativePrompt || SMOOTH_NEGATIVE_DEFAULT },
  };

  const vaeId = String(n++);
  wf[vaeId] = { class_type: "VAELoader", inputs: { vae_name: p.vaeName } };

  const latentInputs: Record<string, any> = {
    vae: [vaeId, 0],
    width: p.width,
    height: p.height,
    length: p.numFrames,
    batch_size: 1,
  };

  if (p.startImageName) {
    const loadImgId = String(n++);
    wf[loadImgId] = {
      class_type: "LoadImage",
      inputs: { image: p.startImageName },
    };
    latentInputs.start_image = [loadImgId, 0];
  }

  const latentId = String(n++);
  wf[latentId] = {
    class_type: "Wan22ImageToVideoLatent",
    inputs: latentInputs,
  };

  const samplerId = String(n++);
  wf[samplerId] = {
    class_type: "KSampler",
    inputs: {
      model: [shiftId, 0],
      positive: [posId, 0],
      negative: [negId, 0],
      latent_image: [latentId, 0],
      seed: p.seed,
      steps: p.steps,
      cfg: p.cfg,
      sampler_name: p.samplerName,
      scheduler: p.scheduler,
      denoise: 1,
    },
  };

  const decodeId = String(n++);
  wf[decodeId] = {
    class_type: "VAEDecode",
    inputs: { vae: [vaeId, 0], samples: [samplerId, 0] },
  };

  // RIFE VFI — frame interpolation (the "smooth" part)
  let framesSource: [string, number] = [decodeId, 0];
  let outputFps = p.fps;
  if (p.rifeMultiplier > 1) {
    const rifeId = String(n++);
    wf[rifeId] = {
      class_type: "RIFE VFI",
      inputs: {
        ckpt_name: "rife49.pth",
        frames: [decodeId, 0],
        clear_cache_after_n_frames: 10,
        multiplier: p.rifeMultiplier,
        fast_mode: true,
        ensemble: true,
        scale_factor: 1.0,
        dtype: "float32",
        torch_compile: false,
        batch_size: 1,
      },
    };
    framesSource = [rifeId, 0];
    outputFps = p.fps * p.rifeMultiplier;
  }

  const createVidId = String(n++);
  wf[createVidId] = {
    class_type: "CreateVideo",
    inputs: { images: framesSource, fps: outputFps },
  };

  const saveId = String(n++);
  wf[saveId] = {
    class_type: "SaveVideo",
    inputs: {
      video: [createVidId, 0],
      filename_prefix: `FS_WANSMOOTH_${Date.now()}`,
      format: "mp4",
      codec: "h264",
    },
  };

  return wf;
}
