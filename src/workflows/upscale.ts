export interface UpscaleParams {
  imageName: string;
  method: string;
  scale: number;
}

const AI_MODEL_MAP: Record<string, string> = {
  ai_ultrasharp: "4x-UltraSharp.pth",
  ai_realesrgan: "RealESRGAN_x4plus.pth",
  ai_realesrgan_x2: "RealESRGAN_x2plus.pth",
  ai_anime: "RealESRGAN_x4plus_anime_6B.pth",
};

export function buildUpscaleWorkflow(p: UpscaleParams): Record<string, any> {
  const isAI = p.method.startsWith("ai_");

  if (isAI) {
    const modelName = AI_MODEL_MAP[p.method] || "4x-UltraSharp.pth";
    return {
      "1": { class_type: "LoadImage", inputs: { image: p.imageName } },
      "2": { class_type: "UpscaleModelLoader", inputs: { model_name: modelName } },
      "3": { class_type: "ImageUpscaleWithModel", inputs: { upscale_model: ["2", 0], image: ["1", 0] } },
      "4": { class_type: "SaveImage", inputs: { images: ["3", 0], filename_prefix: `UP_${Date.now()}` } },
    };
  }

  return {
    "1": { class_type: "LoadImage", inputs: { image: p.imageName } },
    "2": { class_type: "ImageScaleBy", inputs: { image: ["1", 0], upscale_method: p.method, scale_by: p.scale } },
    "3": { class_type: "SaveImage", inputs: { images: ["2", 0], filename_prefix: `UP_${Date.now()}` } },
  };
}
