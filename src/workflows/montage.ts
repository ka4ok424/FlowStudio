export interface MontageClipParam {
  filename: string;        // uploaded silent/with-audio video in ComfyUI input/
  skipFrames: number;      // VHS_LoadVideo.skip_first_frames (computed from trim.start * native_fps)
  frameCap: number;        // VHS_LoadVideo.frame_load_cap (0 = full)
  forceRate: number;       // 0 = keep native, else resample to target fps
}

export interface MontageParams {
  clips: MontageClipParam[];
  outputFps: number;       // frame_rate written into the final mp4
  includeAudio: boolean;
}

/**
 * Build ComfyUI workflow that concatenates N video clips into a single MP4.
 *
 * Pipeline (per first-clip parameters):
 *   For each clip i:
 *     VHS_LoadVideo(file=clip_i, skip=trim.start*fps, cap=(trim.end-trim.start)*fps,
 *                   force_rate = 0 for clip 0, outputFps for clips 1..N-1)
 *   Chain frames pairwise via VHS_MergeImages(merge_strategy="match A") → output
 *     resolution + scale match clip 0 (auto-resized via bilinear).
 *   If includeAudio: chain audio pairwise via AudioConcat(direction="after").
 *   VHS_VideoCombine(images, frame_rate=outputFps, format="video/h264-mp4", audio?).
 */
export function buildMontageWorkflow(p: MontageParams): Record<string, any> {
  if (!p.clips.length) throw new Error("No clips to concatenate");

  const wf: Record<string, any> = {};
  let n = 1;

  const loadIds: string[] = [];
  for (const c of p.clips) {
    const id = String(n++);
    wf[id] = {
      class_type: "VHS_LoadVideo",
      inputs: {
        video: c.filename,
        force_rate: c.forceRate,
        custom_width: 0,
        custom_height: 0,
        frame_load_cap: c.frameCap,
        skip_first_frames: c.skipFrames,
        select_every_nth: 1,
      },
    };
    loadIds.push(id);
  }

  // Pairwise frame concat — first clip's resolution wins
  let imgRef: [string, number] = [loadIds[0], 0];
  for (let i = 1; i < loadIds.length; i++) {
    const id = String(n++);
    wf[id] = {
      class_type: "VHS_MergeImages",
      inputs: {
        images_A: imgRef,
        images_B: [loadIds[i], 0],
        merge_strategy: "match A",
        scale_method: "bilinear",
        crop: "center",
      },
    };
    imgRef = [id, 0];
  }

  // Pairwise audio concat
  let audioRef: [string, number] | null = null;
  if (p.includeAudio && loadIds.length > 0) {
    audioRef = [loadIds[0], 2];
    for (let i = 1; i < loadIds.length; i++) {
      const id = String(n++);
      wf[id] = {
        class_type: "AudioConcat",
        inputs: {
          audio1: audioRef,
          audio2: [loadIds[i], 2],
          direction: "after",
        },
      };
      audioRef = [id, 0];
    }
  }

  const combineInputs: Record<string, any> = {
    images: imgRef,
    frame_rate: p.outputFps,
    loop_count: 0,
    filename_prefix: `FS_MONTAGE_${Date.now()}`,
    format: "video/h264-mp4",
    pingpong: false,
    save_output: true,
  };
  if (audioRef) combineInputs.audio = audioRef;

  const combineId = String(n++);
  wf[combineId] = { class_type: "VHS_VideoCombine", inputs: combineInputs };

  return wf;
}
