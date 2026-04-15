export type WanAnimateMode = "animate" | "replace";

export interface WanAnimateParams {
  mode: WanAnimateMode;
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
  // Reference character image (uploaded to ComfyUI)
  refImageName: string;
  // Driving video frames (uploaded to ComfyUI) — for pose extraction
  poseVideoName: string | null;
  // Face video (for replacement mode)
  faceVideoName: string | null;
  // Strengths
  poseStrength: number;
  faceStrength: number;
}

/**
 * Build ComfyUI workflow for Wan 2.2 Animate (motion transfer / character replacement).
 *
 * Animation mode: reference_image + pose_video → video of character with those poses
 * Replacement mode: reference_image + face_video → video with character replaced
 */
export function buildWanAnimateWorkflow(p: WanAnimateParams): Record<string, any> {
  const workflow: Record<string, any> = {};
  let n = 1;

  // 1. Load Animate model (GGUF)
  const modelId = String(n++);
  workflow[modelId] = {
    class_type: "WanVideoModelLoader",
    inputs: {
      model: "Wan22Animate\\Wan2_2_Animate_14B_Q4_K_M.gguf",
      base_precision: "bf16",
      quantization: "disabled",
      load_device: "main_device",
    },
  };

  // 2. Block swap (14B model needs it on 32GB VRAM)
  const blockSwapId = String(n++);
  workflow[blockSwapId] = {
    class_type: "WanVideoBlockSwap",
    inputs: {
      blocks_to_swap: 20,
      offload_img_emb: false,
      offload_txt_emb: false,
    },
  };

  // Re-create model loader with block swap
  workflow[modelId].inputs.block_swap_args = [blockSwapId, 0];

  // 3. Load VAE (Wan 2.1 for Animate)
  const vaeId = String(n++);
  workflow[vaeId] = {
    class_type: "WanVideoVAELoader",
    inputs: { model_name: "Wan2.1_VAE.pth" },
  };

  // 4. Load T5 text encoder
  const t5Id = String(n++);
  workflow[t5Id] = {
    class_type: "LoadWanVideoT5TextEncoder",
    inputs: {
      model_name: "models_t5_umt5-xxl-enc-bf16.pth",
      precision: "bf16",
    },
  };

  // 5. Text encode
  const textId = String(n++);
  workflow[textId] = {
    class_type: "WanVideoTextEncode",
    inputs: {
      positive_prompt: p.prompt,
      negative_prompt: p.negativePrompt,
      t5: [t5Id, 0],
      force_offload: true,
    },
  };

  // 6. CLIP vision encode (for reference image)
  const clipVisionLoadId = String(n++);
  workflow[clipVisionLoadId] = {
    class_type: "CLIPVisionLoader",
    inputs: { clip_name: "models_clip_open-clip-xlm-roberta-large-vit-huge-14.pth" },
  };

  const loadRefImgId = String(n++);
  workflow[loadRefImgId] = {
    class_type: "LoadImage",
    inputs: { image: p.refImageName },
  };

  const clipVisionEncId = String(n++);
  workflow[clipVisionEncId] = {
    class_type: "WanVideoClipVisionEncode",
    inputs: {
      clip_vision: [clipVisionLoadId, 0],
      image_1: [loadRefImgId, 0],
      strength_1: 1.0,
      strength_2: 1.0,
      crop: "center",
      combine_embeds: "average",
      force_offload: true,
    },
  };

  // 7. Load pose/face video
  const animateInputs: Record<string, any> = {
    vae: [vaeId, 0],
    width: p.width,
    height: p.height,
    num_frames: p.numFrames,
    force_offload: true,
    frame_window_size: 77,
    colormatch: "disabled",
    pose_strength: p.poseStrength,
    face_strength: p.faceStrength,
    clip_embeds: [clipVisionEncId, 0],
    ref_images: [loadRefImgId, 0],
  };

  if (p.mode === "animate" && p.poseVideoName) {
    const loadPoseId = String(n++);
    workflow[loadPoseId] = {
      class_type: "LoadImage",
      inputs: { image: p.poseVideoName },
    };
    animateInputs.pose_images = [loadPoseId, 0];
  }

  if (p.mode === "replace" && p.faceVideoName) {
    const loadFaceId = String(n++);
    workflow[loadFaceId] = {
      class_type: "LoadImage",
      inputs: { image: p.faceVideoName },
    };
    animateInputs.face_images = [loadFaceId, 0];
  }

  // 8. WanVideoAnimateEmbeds
  const animateId = String(n++);
  workflow[animateId] = {
    class_type: "WanVideoAnimateEmbeds",
    inputs: animateInputs,
  };

  // 9. Sample
  const samplerId = String(n++);
  workflow[samplerId] = {
    class_type: "WanVideoSampler",
    inputs: {
      model: [modelId, 0],
      image_embeds: [animateId, 0],
      steps: p.steps,
      cfg: p.cfg,
      shift: p.shift,
      seed: p.seed,
      force_offload: true,
      scheduler: "unipc",
      riflex_freq_index: 0,
      text_embeds: [textId, 0],
    },
  };

  // 10. VAE Decode
  const decodeId = String(n++);
  workflow[decodeId] = {
    class_type: "WanVideoDecode",
    inputs: {
      vae: [vaeId, 0],
      samples: [samplerId, 0],
      enable_vae_tiling: false,
      tile_x: 272,
      tile_y: 272,
      tile_stride_x: 144,
      tile_stride_y: 128,
    },
  };

  // 11. Save as video
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
      filename_prefix: `FS_ANIM_${Date.now()}`,
      format: "mp4",
      codec: "h264",
    },
  };

  return workflow;
}
