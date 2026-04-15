export interface HunyuanAvatarParams {
  prompt: string;
  negativePrompt: string;
  seed: number;
  steps: number;
  cfg: number;
  width: number;
  height: number;
  videoLength: number;
  fps: number;
  duration: number;
  faceSize: number;
  imageSize: number;
  objectName: string;
  // Uploaded to ComfyUI
  imageName: string;
  audioName: string;
  transformerModel: string;
}

/**
 * Build ComfyUI workflow for HunyuanVideo-Avatar (audio-driven talking head).
 * Uses smthemex/ComfyUI_HunyuanAvatar_Sm nodes (patched for SDPA).
 */
export function buildHunyuanAvatarWorkflow(p: HunyuanAvatarParams): Record<string, any> {
  const workflow: Record<string, any> = {};
  let n = 1;

  // 1. Load Avatar model
  const loaderId = String(n++);
  workflow[loaderId] = {
    class_type: "HY_Avatar_Loader",
    inputs: {
      transformer: p.transformerModel,
      use_fp8: true,
      cpu_offload: true,
    },
  };

  // 2. Load image
  const loadImgId = String(n++);
  workflow[loadImgId] = {
    class_type: "LoadImage",
    inputs: { image: p.imageName },
  };

  // 3. Load audio
  const loadAudioId = String(n++);
  workflow[loadAudioId] = {
    class_type: "LoadAudio",
    inputs: { audio: p.audioName },
  };

  // 4. PreData — prepare all inputs
  const preDataId = String(n++);
  workflow[preDataId] = {
    class_type: "HY_Avatar_PreData",
    inputs: {
      model: [loaderId, 0],
      args: [loaderId, 1],
      audio: [loadAudioId, 0],
      image: [loadImgId, 0],
      fps: p.fps,
      width: p.width,
      height: p.height,
      face_size: p.faceSize,
      image_size: p.imageSize,
      video_length: p.videoLength,
      prompt: p.prompt,
      negative_prompt: p.negativePrompt,
      duration: p.duration,
      infer_min: p.videoLength <= 128,
      object_name: p.objectName,
      seed: p.seed,
      steps: p.steps,
      cfg_scale: p.cfg,
      vae_tiling: true,
    },
  };

  // 5. Sample — generate video
  const samplerId = String(n++);
  workflow[samplerId] = {
    class_type: "HY_Avatar_Sampler",
    inputs: {
      model: [preDataId, 0],
      json_loader: [preDataId, 1],
      audio_model: [preDataId, 2],
    },
  };

  // 6. Save as video
  const createVidId = String(n++);
  workflow[createVidId] = {
    class_type: "CreateVideo",
    inputs: { images: [samplerId, 0], fps: p.fps },
  };
  const saveId = String(n++);
  workflow[saveId] = {
    class_type: "SaveVideo",
    inputs: {
      video: [createVidId, 0],
      filename_prefix: `FS_AVATAR_${Date.now()}`,
      format: "mp4",
      codec: "h264",
    },
  };

  return workflow;
}
