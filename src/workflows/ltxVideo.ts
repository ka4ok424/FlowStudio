export interface LtxVideoParams {
  prompt: string;
  negativePrompt: string;
  seed: number;
  steps: number;
  cfg: number;
  width: number;
  height: number;
  frames: number;
  fps: number;
  stg: number;
  maxShift: number;
  baseShift: number;
  maxLength: number;
  // Guide frames: {comfyImageName, frameIndex}[]
  guideFrames: { name: string; idx: number }[];
  frameStrength: number;
}

/**
 * Build ComfyUI workflow for LTX Video 2.3 distilled fp8.
 * Uses euler sampler (CFG=1 optimization: 1 pass per step instead of 2).
 * LTXVScheduler + LTXVBaseSampler + STG — proven fast on RTX 5090.
 */
export function buildLtxVideoWorkflow(p: LtxVideoParams): Record<string, any> {
  const workflow: Record<string, any> = {};
  let n = 1;

  // 1. Model + VAE from checkpoint
  const ckptId = String(n++);
  workflow[ckptId] = { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "LTX-Video\\ltx-2.3-22b-dev-nvfp4.safetensors" } };

  // 2. Text encoder (Gemma 3)
  const clipId = String(n++);
  workflow[clipId] = {
    class_type: "LTXVGemmaCLIPModelLoader",
    inputs: {
      gemma_path: "gemma-3-12b-it-qat-q4_0-unquantized\\model-00001-of-00005.safetensors",
      ltxv_path: "LTX-Video\\ltx-2.3-22b-dev-nvfp4.safetensors",
      max_length: p.maxLength,
    },
  };

  // 3. Positive + Negative CLIP encode
  const posId = String(n++);
  workflow[posId] = { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: [clipId, 0] } };
  const negId = String(n++);
  workflow[negId] = { class_type: "CLIPTextEncode", inputs: { text: p.negativePrompt, clip: [clipId, 0] } };

  // 4. Conditioning with frame rate
  const condId = String(n++);
  workflow[condId] = { class_type: "LTXVConditioning", inputs: { positive: [posId, 0], negative: [negId, 0], frame_rate: p.fps } };

  // 5. Load guide frame images (if any)
  const guideImageIds: string[] = [];
  const guideIndices: number[] = [];
  for (const frame of p.guideFrames) {
    const imgLoadId = String(n++);
    workflow[imgLoadId] = { class_type: "LoadImage", inputs: { image: frame.name } };
    guideImageIds.push(imgLoadId);
    guideIndices.push(frame.idx);
  }

  // 6. Scheduler (LTXVScheduler — native for LTX, optimized sigma schedule)
  const schedId = String(n++);
  workflow[schedId] = { class_type: "LTXVScheduler", inputs: { steps: p.steps, max_shift: p.maxShift, base_shift: p.baseShift, stretch: false, terminal: 0.1 } };

  // 7. Sampler select — euler (CFG=1 optimization: 1 model pass per step)
  const sampSelId = String(n++);
  workflow[sampSelId] = { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } };

  // 8. Noise
  const noiseId = String(n++);
  workflow[noiseId] = { class_type: "RandomNoise", inputs: { noise_seed: p.seed } };

  // 9. STG (Spatiotemporal Guidance)
  const stgId = String(n++);
  workflow[stgId] = { class_type: "LTXVApplySTG", inputs: { model: [ckptId, 0], block_indices: "27" } };

  // 10. CFG Guider (cfg=1.0 — enables single-pass optimization with euler)
  const guiderId = String(n++);
  workflow[guiderId] = { class_type: "CFGGuider", inputs: { model: [stgId, 0], positive: [condId, 0], negative: [condId, 1], cfg: p.cfg } };

  // 11. LTXVBaseSampler
  const baseSampId = String(n++);
  const baseSampInputs: Record<string, any> = {
    model: [ckptId, 0], vae: [ckptId, 2],
    width: p.width, height: p.height, num_frames: p.frames,
    guider: [guiderId, 0], sampler: [sampSelId, 0], sigmas: [schedId, 0], noise: [noiseId, 0],
  };

  // I2V: pass guide frames via optional inputs
  if (guideImageIds.length === 1) {
    baseSampInputs.optional_cond_images = [guideImageIds[0], 0];
    baseSampInputs.optional_cond_indices = String(guideIndices[0]);
    baseSampInputs.strength = p.frameStrength;
  } else if (guideImageIds.length > 1) {
    const batchId = String(n++);
    workflow[batchId] = { class_type: "ImageBatch", inputs: { image1: [guideImageIds[0], 0], image2: [guideImageIds[1], 0] } };
    let lastBatchId = batchId;
    for (let i = 2; i < guideImageIds.length; i++) {
      const nextBatchId = String(n++);
      workflow[nextBatchId] = { class_type: "ImageBatch", inputs: { image1: [lastBatchId, 0], image2: [guideImageIds[i], 0] } };
      lastBatchId = nextBatchId;
    }
    baseSampInputs.optional_cond_images = [lastBatchId, 0];
    baseSampInputs.optional_cond_indices = guideIndices.join(",");
    baseSampInputs.strength = p.frameStrength;
  }
  workflow[baseSampId] = { class_type: "LTXVBaseSampler", inputs: baseSampInputs };

  // 12. VAE Decode
  const decodeId = String(n++);
  workflow[decodeId] = {
    class_type: "LTXVTiledVAEDecode",
    inputs: {
      vae: [ckptId, 2],
      latents: [baseSampId, 0],
      horizontal_tiles: 2,
      vertical_tiles: 2,
      overlap: 4,
      last_frame_fix: true,
    },
  };

  // 13. Convert frames to video and save as MP4
  const createVidId = String(n++);
  workflow[createVidId] = { class_type: "CreateVideo", inputs: { images: [decodeId, 0], fps: p.fps } };
  const saveId = String(n++);
  workflow[saveId] = {
    class_type: "SaveVideo",
    inputs: { video: [createVidId, 0], filename_prefix: `FS_VID_${Date.now()}`, format: "mp4", codec: "h264" },
  };

  return workflow;
}

export function buildLtxWarmupWorkflow(prompt: string, seed: number, fps: number, maxShift: number, baseShift: number): Record<string, any> {
  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "LTX-Video\\ltx-2.3-22b-dev-nvfp4.safetensors" } },
    "2": { class_type: "LTXVGemmaCLIPModelLoader", inputs: { gemma_path: "gemma-3-12b-it-qat-q4_0-unquantized\\model-00001-of-00005.safetensors", ltxv_path: "LTX-Video\\ltx-2.3-22b-dev-nvfp4.safetensors", max_length: 512 } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["2", 0] } },
    "4": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["2", 0] } },
    "5": { class_type: "LTXVConditioning", inputs: { positive: ["3", 0], negative: ["4", 0], frame_rate: fps } },
    "6": { class_type: "LTXVScheduler", inputs: { steps: 1, max_shift: maxShift, base_shift: baseShift, stretch: false, terminal: 0.1 } },
    "7": { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } },
    "8": { class_type: "RandomNoise", inputs: { noise_seed: seed } },
    "9": { class_type: "LTXVApplySTG", inputs: { model: ["1", 0], block_indices: "27" } },
    "10": { class_type: "CFGGuider", inputs: { model: ["9", 0], positive: ["5", 0], negative: ["5", 1], cfg: 1.0 } },
    "11": { class_type: "LTXVBaseSampler", inputs: { model: ["1", 0], vae: ["1", 2], width: 128, height: 128, num_frames: 9, guider: ["10", 0], sampler: ["7", 0], sigmas: ["6", 0], noise: ["8", 0] } },
    "12": { class_type: "LTXVTiledVAEDecode", inputs: { vae: ["1", 2], latents: ["11", 0], horizontal_tiles: 1, vertical_tiles: 1, overlap: 1, last_frame_fix: true } },
    "13": { class_type: "SaveAnimatedWEBP", inputs: { images: ["12", 0], filename_prefix: "_warmup", fps: 8, lossless: false, quality: 30, method: "default" } },
  };
}
