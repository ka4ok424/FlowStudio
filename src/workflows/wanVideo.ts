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
  startImageName: string | null;   // uploaded ComfyUI image name
  noiseAugStrength: number;
}

/**
 * Build ComfyUI workflow for Wan 2.2 TI2V-5B (image + prompt → video).
 * Uses WanVideoWrapper nodes (GGUF model).
 */
export function buildWanVideoWorkflow(p: WanVideoParams): Record<string, any> {
  const workflow: Record<string, any> = {};
  let n = 1;

  // 1. Load model (GGUF)
  const modelId = String(n++);
  workflow[modelId] = {
    class_type: "WanVideoModelLoader",
    inputs: {
      model: "Wan2.2-TI2V-5B-Q8_0.gguf",
      base_precision: "bf16",
      quantization: "disabled",
      load_device: "main_device",
    },
  };

  // 2. Load VAE (Wan 2.2)
  const vaeId = String(n++);
  workflow[vaeId] = {
    class_type: "WanVideoVAELoader",
    inputs: { model_name: "VAE\\Wan2.2_VAE.safetensors" },
  };

  // 3. Load T5 text encoder
  const t5Id = String(n++);
  workflow[t5Id] = {
    class_type: "LoadWanVideoT5TextEncoder",
    inputs: {
      model_name: "models_t5_umt5-xxl-enc-bf16.pth",
      precision: "bf16",
    },
  };

  // 4. Text encode
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

  // 5. Encode image → video latents
  const imgEncId = String(n++);
  const imgEncInputs: Record<string, any> = {
    width: p.width,
    height: p.height,
    num_frames: p.numFrames,
    noise_aug_strength: p.noiseAugStrength,
    start_latent_strength: 1.0,
    end_latent_strength: 1.0,
    force_offload: true,
    vae: [vaeId, 0],
  };

  // If start image is provided, load and connect it
  if (p.startImageName) {
    const loadImgId = String(n++);
    workflow[loadImgId] = {
      class_type: "LoadImage",
      inputs: { image: p.startImageName },
    };
    imgEncInputs.start_image = [loadImgId, 0];

    // CLIP vision encode for the start image
    const clipVisionLoadId = String(n++);
    workflow[clipVisionLoadId] = {
      class_type: "CLIPVisionLoader",
      inputs: { clip_name: "models_clip_open-clip-xlm-roberta-large-vit-huge-14.pth" },
    };
    const clipVisionEncId = String(n++);
    workflow[clipVisionEncId] = {
      class_type: "WanVideoClipVisionEncode",
      inputs: {
        clip_vision: [clipVisionLoadId, 0],
        image_1: [loadImgId, 0],
        strength_1: 1.0,
        strength_2: 1.0,
        crop: "center",
        combine_embeds: "average",
        force_offload: true,
      },
    };
    imgEncInputs.clip_embeds = [clipVisionEncId, 0];
  }

  workflow[imgEncId] = {
    class_type: "WanVideoImageToVideoEncode",
    inputs: imgEncInputs,
  };

  // 6. Sample
  const samplerId = String(n++);
  workflow[samplerId] = {
    class_type: "WanVideoSampler",
    inputs: {
      model: [modelId, 0],
      image_embeds: [imgEncId, 0],
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

  // 7. VAE Decode
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

  // 8. Save as video
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
