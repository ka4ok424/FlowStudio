export interface MmAudioParams {
  prompt: string;
  negativePrompt: string;
  seed: number;
  steps: number;
  cfg: number;
  duration: number;       // seconds
  videoFileName: string;  // uploaded silent video filename (in input folder)
  fps: number;            // for syncing audio to video frames
  maskAwayClip: boolean;  // if true, only sync_frames are used (no semantic CLIP)
  // Model file names (in ComfyUI/models/mmaudio/)
  mmaudioModel: string;
  vaeModel: string;
  synchformerModel: string;
  clipModel: string;
}

/**
 * Build ComfyUI workflow that adds AI-generated audio to an existing silent video.
 *
 * Pipeline:
 *   VHS_LoadVideo (silent input MP4)
 *     ├─ frames → MMAudioSampler.images
 *     └─ audio (none/ignored) ──╳
 *
 *   MMAudioModelLoader → MMAUDIO_MODEL ─┐
 *   MMAudioFeatureUtilsLoader           ├→ MMAudioSampler(prompt, neg, duration, steps, cfg, images)
 *     (vae + synchformer + clip)        │      ↓
 *                                       │   AUDIO
 *                                       │      ↓
 *   VHS_LoadVideo.frames ────────────────────→ CreateVideo(images, fps, audio)
 *                                              ↓
 *                                            SaveVideo (MP4 H.264 + AAC)
 *
 * MMAudio analyzes the input video frames (CLIP for semantic, Synchformer for sync)
 * and generates matching audio guided by the text prompt. Output is the same video
 * with the synthesized audio merged into the file.
 *
 * Models live in ComfyUI/models/mmaudio/ (Kijai safetensors fp16):
 *   - mmaudio_large_44k_v2_fp16.safetensors      (main MMAudio diffusion)
 *   - mmaudio_vae_44k_fp16.safetensors           (audio VAE)
 *   - mmaudio_synchformer_fp16.safetensors       (sync feature extractor)
 *   - apple_DFN5B-CLIP-ViT-H-14-384_fp16.safetensors (semantic CLIP)
 *   - bigvgan_v2 vocoder is auto-downloaded by the loader to nvidia/bigvgan_...
 */
export function buildMmAudioWorkflow(p: MmAudioParams): Record<string, any> {
  const wf: Record<string, any> = {};
  let n = 1;

  const loadVidId = String(n++);
  wf[loadVidId] = {
    class_type: "VHS_LoadVideo",
    inputs: {
      video: p.videoFileName,
      force_rate: 0,
      custom_width: 0,
      custom_height: 0,
      frame_load_cap: 0,
      skip_first_frames: 0,
      select_every_nth: 1,
    },
  };

  const modelLoadId = String(n++);
  wf[modelLoadId] = {
    class_type: "MMAudioModelLoader",
    inputs: { mmaudio_model: p.mmaudioModel, base_precision: "fp16" },
  };

  const featUtilsId = String(n++);
  wf[featUtilsId] = {
    class_type: "MMAudioFeatureUtilsLoader",
    inputs: {
      vae_model: p.vaeModel,
      synchformer_model: p.synchformerModel,
      clip_model: p.clipModel,
      mode: "44k",
      precision: "fp16",
    },
  };

  const samplerId = String(n++);
  wf[samplerId] = {
    class_type: "MMAudioSampler",
    inputs: {
      mmaudio_model: [modelLoadId, 0],
      feature_utils: [featUtilsId, 0],
      duration: p.duration,
      steps: p.steps,
      cfg: p.cfg,
      seed: p.seed,
      prompt: p.prompt,
      negative_prompt: p.negativePrompt,
      mask_away_clip: p.maskAwayClip,
      force_offload: true,
      images: [loadVidId, 0],
    },
  };

  const createVidId = String(n++);
  wf[createVidId] = {
    class_type: "CreateVideo",
    inputs: {
      images: [loadVidId, 0],
      fps: p.fps,
      audio: [samplerId, 0],
    },
  };

  const saveId = String(n++);
  wf[saveId] = {
    class_type: "SaveVideo",
    inputs: {
      video: [createVidId, 0],
      filename_prefix: `FS_MMAUDIO_${Date.now()}`,
      format: "mp4",
      codec: "h264",
    },
  };

  return wf;
}
