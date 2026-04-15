export interface HunyuanVideoParams {
  prompt: string;
  seed: number;
  steps: number;
  cfg: number;
  flowShift: number;
  width: number;
  height: number;
  numFrames: number;
  fps: number;
  startImageName: string | null;
  denoise: number;
}

/**
 * Build ComfyUI workflow for HunyuanVideo 1.5 I2V (image + prompt → video).
 * Uses Kijai's HunyuanVideoWrapper nodes (GGUF model).
 */
export function buildHunyuanVideoWorkflow(p: HunyuanVideoParams): Record<string, any> {
  const workflow: Record<string, any> = {};
  let n = 1;

  // 1. Load model (GGUF)
  const modelId = String(n++);
  workflow[modelId] = {
    class_type: "HyVideoModelLoader",
    inputs: {
      model: "hunyuan_video_I2V_fp8_e4m3fn.safetensors",
      base_precision: "bf16",
      quantization: "fp8_e4m3fn",
      load_device: "main_device",
    },
  };

  // 2. Load VAE
  const vaeId = String(n++);
  workflow[vaeId] = {
    class_type: "HyVideoVAELoader",
    inputs: { model_name: "hunyuan_video_vae_bf16.safetensors" },
  };

  // 3. Download & load text encoder (auto-downloads from HF on first run)
  const textEncLoadId = String(n++);
  workflow[textEncLoadId] = {
    class_type: "DownloadAndLoadHyVideoTextEncoder",
    inputs: {
      llm_model: "Kijai/llava-llama-3-8b-text-encoder-tokenizer",
      clip_model: "openai/clip-vit-large-patch14",
      precision: "fp16",
      quantization: "fp8_e4m3fn",
    },
  };

  // 4. Text/Image encode
  const isI2V = !!p.startImageName;
  const encodeId = String(n++);

  if (isI2V) {
    // Load start image
    const loadImgId = String(n++);
    workflow[loadImgId] = {
      class_type: "LoadImage",
      inputs: { image: p.startImageName },
    };

    workflow[encodeId] = {
      class_type: "HyVideoI2VEncode",
      inputs: {
        text_encoders: [textEncLoadId, 0],
        prompt: p.prompt,
        force_offload: true,
        prompt_template: "I2V_video",
        image: [loadImgId, 0],
      },
    };
  } else {
    workflow[encodeId] = {
      class_type: "HyVideoTextEncode",
      inputs: {
        text_encoders: [textEncLoadId, 0],
        prompt: p.prompt,
        force_offload: true,
        prompt_template: "video",
      },
    };
  }

  // 5. Sample
  const samplerId = String(n++);
  const samplerInputs: Record<string, any> = {
    model: [modelId, 0],
    hyvid_embeds: [encodeId, 0],
    width: p.width,
    height: p.height,
    num_frames: p.numFrames,
    steps: p.steps,
    embedded_guidance_scale: p.cfg,
    flow_shift: p.flowShift,
    seed: p.seed,
    force_offload: true,
  };
  if (p.denoise < 1.0) {
    samplerInputs.denoise_strength = p.denoise;
  }
  workflow[samplerId] = {
    class_type: "HyVideoSampler",
    inputs: samplerInputs,
  };

  // 6. VAE Decode
  const decodeId = String(n++);
  workflow[decodeId] = {
    class_type: "HyVideoDecode",
    inputs: {
      vae: [vaeId, 0],
      samples: [samplerId, 0],
      enable_vae_tiling: true,
      temporal_tiling_sample_size: 64,
      spatial_tile_sample_min_size: 256,
      auto_tile_size: true,
    },
  };

  // 7. Save as video
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
      filename_prefix: `FS_HV_${Date.now()}`,
      format: "mp4",
      codec: "h264",
    },
  };

  return workflow;
}
