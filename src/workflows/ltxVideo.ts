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
  // Optional upscalers (Stage 2 refinement, Lightricks multi-stage pipeline)
  spatialUpscale?: boolean;   // x2 spatial — 2× width and 2× height
  temporalUpscale?: boolean;  // x2 temporal — 2× frames and 2× fps (smoother motion)
  // Starting sigma for temporal refinement noise schedule (default 0.4).
  // Lower = preserves Stage-1 identity more strictly (no face drift).
  // Higher = more "creative" interpolation but characters may shift.
  // Lightricks default = 0.85; we lowered for identity preservation.
  temporalStartSigma?: number;
}

const SPATIAL_UPSCALER_MODEL = "ltx-2.3-spatial-upscaler-x2-1.1.safetensors";
const TEMPORAL_UPSCALER_MODEL = "ltx-2.3-temporal-upscaler-x2-1.0.safetensors";
// Refinement sigma schedule from Lightricks' Two_Stage_Distilled reference workflow.
// Spatial keeps the original Lightricks values — high sigma is fine because spatial
// has lots of pixel constraints, identity drift is minimal.
const SPATIAL_REFINEMENT_SIGMAS = "0.85, 0.725, 0.422, 0.0";
// Temporal sigma schedule is parameterized via p.temporalStartSigma (default 0.4).
// We scale Lightricks' original ratios (1.0, 0.853, 0.497, 0.0) by the start value, so
// the schedule keeps the same "shape" — just a different peak.
function buildTemporalSigmas(start: number): string {
  const ratios = [1.0, 0.853, 0.497, 0.0];
  return ratios.map((r) => (start * r).toFixed(3)).join(", ");
}

/**
 * Build ComfyUI workflow for LTX Video 2.3 — Kijai-style separated loaders
 * plus optional multi-stage upscaling (spatial x2, temporal x2).
 *
 * Base pipeline:
 *   UNETLoader (transformer-only fp8_input_scaled_v3)
 *   DualCLIPLoader (Gemma 3 12B + LTX text projection, type=ltxv)
 *   VAELoaderKJ (video VAE bf16)
 *   → CLIPTextEncode × 2 → LTXVConditioning → LTXVScheduler → KSamplerSelect
 *   → RandomNoise → LTXVApplySTG → CFGGuider → LTXVBaseSampler
 *
 * If spatialUpscale: Stage 2 refinement via LTXVLatentUpsampler(spatial x2)
 *   + SamplerCustomAdvanced with ManualSigmas for partial denoising.
 *
 * If temporalUpscale: same pattern with temporal x2 model (doubles fps).
 *
 * Both can be combined: spatial runs first, then temporal, then decode.
 */
export function buildLtxVideoWorkflow(p: LtxVideoParams): Record<string, any> {
  const workflow: Record<string, any> = {};
  let n = 1;

  // 1. UNETLoader — LTX 2.3 transformer-only fp8 input_scaled_v3 (Blackwell-optimized)
  const unetId = String(n++);
  workflow[unetId] = {
    class_type: "UNETLoader",
    inputs: {
      unet_name: "LTX23\\ltx-2.3-22b-distilled_transformer_only_fp8_input_scaled_v3.safetensors",
      weight_dtype: "default",
    },
  };

  // 2. DualCLIPLoader — Gemma 3 12B (single-file) + LTX text projection
  const clipId = String(n++);
  workflow[clipId] = {
    class_type: "DualCLIPLoader",
    inputs: {
      clip_name1: "gemma_3_12B_it.safetensors",
      clip_name2: "LTX23_text_projection_bf16.safetensors",
      type: "ltxv",
      device: "default",
    },
  };

  // 3. VAELoaderKJ — video VAE (bf16, main_device)
  const vaeId = String(n++);
  workflow[vaeId] = {
    class_type: "VAELoaderKJ",
    inputs: {
      vae_name: "LTX23\\LTX23_video_vae_bf16.safetensors",
      device: "main_device",
      weight_dtype: "bf16",
    },
  };

  // 4. Positive + Negative text encoding
  const posId = String(n++);
  workflow[posId] = { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: [clipId, 0] } };
  const negId = String(n++);
  workflow[negId] = { class_type: "CLIPTextEncode", inputs: { text: p.negativePrompt, clip: [clipId, 0] } };

  // 5. LTXVConditioning — adds frame_rate context
  const condId = String(n++);
  workflow[condId] = { class_type: "LTXVConditioning", inputs: { positive: [posId, 0], negative: [negId, 0], frame_rate: p.fps } };

  // 6. Guide frames (optional) — LoadImage for each
  const guideImageIds: string[] = [];
  const guideIndices: number[] = [];
  for (const frame of p.guideFrames) {
    const imgLoadId = String(n++);
    workflow[imgLoadId] = { class_type: "LoadImage", inputs: { image: frame.name } };
    guideImageIds.push(imgLoadId);
    guideIndices.push(frame.idx);
  }

  // 7. Scheduler — stretch=true matches Lightricks reference distilled preset
  const schedId = String(n++);
  workflow[schedId] = { class_type: "LTXVScheduler", inputs: { steps: p.steps, max_shift: p.maxShift, base_shift: p.baseShift, stretch: true, terminal: 0.1 } };

  // 8. Sampler — euler_ancestral_cfg_pp (Lightricks distilled pick)
  const sampSelId = String(n++);
  workflow[sampSelId] = { class_type: "KSamplerSelect", inputs: { sampler_name: "euler_ancestral_cfg_pp" } };

  // 9. Stage 1 noise
  const noiseId = String(n++);
  workflow[noiseId] = { class_type: "RandomNoise", inputs: { noise_seed: p.seed } };

  // 10. STG — Spatiotemporal Guidance (block 27)
  const stgId = String(n++);
  workflow[stgId] = { class_type: "LTXVApplySTG", inputs: { model: [unetId, 0], block_indices: "27" } };

  // 11. CFGGuider (cfg=1.0 with euler → single model pass per step)
  const guiderId = String(n++);
  workflow[guiderId] = { class_type: "CFGGuider", inputs: { model: [stgId, 0], positive: [condId, 0], negative: [condId, 1], cfg: p.cfg } };

  // 12. LTXVBaseSampler — Stage 1
  const baseSampId = String(n++);
  const baseSampInputs: Record<string, any> = {
    model: [unetId, 0], vae: [vaeId, 0],
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

  // Current latent source — starts from Stage 1, may be overridden by upscale stages
  let currentLatentId: string = baseSampId;
  let currentLatentSlot = 0;

  // Refinement helper: build Stage 2+ chain after latent upscaler.
  // Uses SamplerCustomAdvanced + ManualSigmas (partial denoise 0.85 → 0) per Lightricks reference.
  const buildRefinementStage = (upscalerModel: string, seedOffset: number, sigmas: string): void => {
    // Latent upscale model loader
    const loaderId = String(n++);
    workflow[loaderId] = { class_type: "LatentUpscaleModelLoader", inputs: { model_name: upscalerModel } };

    // Upsample the current latent
    const upsampleId = String(n++);
    workflow[upsampleId] = {
      class_type: "LTXVLatentUpsampler",
      inputs: {
        samples: [currentLatentId, currentLatentSlot],
        upscale_model: [loaderId, 0],
        vae: [vaeId, 0],
      },
    };

    // Fresh noise for the refinement pass (seed offset to differ from Stage 1)
    const refNoiseId = String(n++);
    workflow[refNoiseId] = { class_type: "RandomNoise", inputs: { noise_seed: p.seed + seedOffset } };

    // Manual sigmas for partial denoising (starts at 0.85, ends at 0 over 3 steps)
    const refSigmasId = String(n++);
    workflow[refSigmasId] = { class_type: "ManualSigmas", inputs: { sigmas } };

    // SamplerCustomAdvanced — uses existing guider + sampler from Stage 1
    const refSampId = String(n++);
    workflow[refSampId] = {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: [refNoiseId, 0],
        guider: [guiderId, 0],
        sampler: [sampSelId, 0],
        sigmas: [refSigmasId, 0],
        latent_image: [upsampleId, 0],
      },
    };

    currentLatentId = refSampId;
    currentLatentSlot = 0;
  };

  // Optional Stage 2 — Spatial upscale (x2 resolution)
  if (p.spatialUpscale) {
    buildRefinementStage(SPATIAL_UPSCALER_MODEL, 1, SPATIAL_REFINEMENT_SIGMAS);
  }

  // Optional Stage 3 — Temporal upscale (x2 fps / smoother motion)
  if (p.temporalUpscale) {
    const tStart = p.temporalStartSigma ?? 0.4;
    buildRefinementStage(TEMPORAL_UPSCALER_MODEL, 2, buildTemporalSigmas(tStart));
  }

  // Final VAE Decode — tiled for video (tile size accommodates upscaled latents)
  const decodeId = String(n++);
  workflow[decodeId] = {
    class_type: "LTXVTiledVAEDecode",
    inputs: {
      vae: [vaeId, 0],
      latents: [currentLatentId, currentLatentSlot],
      horizontal_tiles: p.spatialUpscale ? 4 : 2,
      vertical_tiles: p.spatialUpscale ? 4 : 2,
      overlap: 4,
      last_frame_fix: true,
    },
  };

  // Final FPS: if temporal upscale, frames were doubled, so we play at 2× fps to keep same duration.
  const finalFps = p.temporalUpscale ? p.fps * 2 : p.fps;

  // Convert frames to video and save as MP4
  const createVidId = String(n++);
  workflow[createVidId] = { class_type: "CreateVideo", inputs: { images: [decodeId, 0], fps: finalFps } };
  const saveId = String(n++);
  workflow[saveId] = {
    class_type: "SaveVideo",
    inputs: { video: [createVidId, 0], filename_prefix: `FS_VID_${Date.now()}`, format: "mp4", codec: "h264" },
  };

  return workflow;
}

export function buildLtxWarmupWorkflow(prompt: string, seed: number, fps: number, maxShift: number, baseShift: number): Record<string, any> {
  return {
    "1": { class_type: "UNETLoader", inputs: { unet_name: "LTX23\\ltx-2.3-22b-distilled_transformer_only_fp8_input_scaled_v3.safetensors", weight_dtype: "default" } },
    "2": { class_type: "DualCLIPLoader", inputs: { clip_name1: "gemma_3_12B_it.safetensors", clip_name2: "LTX23_text_projection_bf16.safetensors", type: "ltxv", device: "default" } },
    "3": { class_type: "VAELoaderKJ", inputs: { vae_name: "LTX23\\LTX23_video_vae_bf16.safetensors", device: "main_device", weight_dtype: "bf16" } },
    "4": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["2", 0] } },
    "5": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["2", 0] } },
    "6": { class_type: "LTXVConditioning", inputs: { positive: ["4", 0], negative: ["5", 0], frame_rate: fps } },
    "7": { class_type: "LTXVScheduler", inputs: { steps: 1, max_shift: maxShift, base_shift: baseShift, stretch: true, terminal: 0.1 } },
    "8": { class_type: "KSamplerSelect", inputs: { sampler_name: "euler_ancestral_cfg_pp" } },
    "9": { class_type: "RandomNoise", inputs: { noise_seed: seed } },
    "10": { class_type: "LTXVApplySTG", inputs: { model: ["1", 0], block_indices: "27" } },
    "11": { class_type: "CFGGuider", inputs: { model: ["10", 0], positive: ["6", 0], negative: ["6", 1], cfg: 1.0 } },
    "12": { class_type: "LTXVBaseSampler", inputs: { model: ["1", 0], vae: ["3", 0], width: 128, height: 128, num_frames: 9, guider: ["11", 0], sampler: ["8", 0], sigmas: ["7", 0], noise: ["9", 0] } },
    "13": { class_type: "LTXVTiledVAEDecode", inputs: { vae: ["3", 0], latents: ["12", 0], horizontal_tiles: 1, vertical_tiles: 1, overlap: 1, last_frame_fix: true } },
    "14": { class_type: "SaveAnimatedWEBP", inputs: { images: ["13", 0], filename_prefix: "_warmup", fps: 8, lossless: false, quality: 30, method: "default" } },
  };
}
