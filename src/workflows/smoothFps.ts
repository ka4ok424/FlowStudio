export interface SmoothFpsParams {
  videoName: string;       // filename already on ComfyUI (/input)
  multiplier: number;      // 2, 3, 4 — how many times to multiply fps
  model: string;           // rife49.pth (default), rife47, rife417, rife426
  sourceFps: number;       // original fps (for computing output fps × multiplier)
  fastMode: boolean;       // skip refinement pass in RIFE
  ensemble: boolean;       // ensemble prediction (slightly slower, higher quality)
}

/**
 * Build ComfyUI workflow for frame interpolation via RIFE.
 * Takes a video file (already uploaded to ComfyUI /input), extracts frames,
 * interpolates with RIFE multiplier×, re-composes as mp4 at multiplied fps.
 */
export function buildSmoothFpsWorkflow(p: SmoothFpsParams): Record<string, any> {
  const outputFps = p.sourceFps * p.multiplier;
  return {
    "1": { class_type: "LoadVideo", inputs: { file: p.videoName } },
    "2": { class_type: "GetVideoComponents", inputs: { video: ["1", 0] } },
    "3": {
      class_type: "RIFE VFI",
      inputs: {
        ckpt_name: p.model,
        frames: ["2", 0],
        clear_cache_after_n_frames: 10,
        multiplier: p.multiplier,
        fast_mode: p.fastMode,
        ensemble: p.ensemble,
        scale_factor: 1,
        dtype: "float32",
        torch_compile: false,
        batch_size: 1,
      },
    },
    "4": { class_type: "CreateVideo", inputs: { images: ["3", 0], fps: outputFps } },
    "5": {
      class_type: "SaveVideo",
      inputs: { video: ["4", 0], filename_prefix: `FS_SMOOTH_${Date.now()}`, format: "mp4", codec: "h264" },
    },
  };
}
