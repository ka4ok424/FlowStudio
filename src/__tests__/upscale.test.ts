import { describe, it, expect } from "vitest";
import { buildUpscaleWorkflow } from "../workflows/upscale";

describe("buildUpscaleWorkflow", () => {
  describe("AI upscale", () => {
    it("UltraSharp uses correct model", () => {
      const wf = buildUpscaleWorkflow({ imageName: "test.png", method: "ai_ultrasharp", scale: 4 });
      expect(wf["2"].class_type).toBe("UpscaleModelLoader");
      expect(wf["2"].inputs.model_name).toBe("4x-UltraSharp.pth");
      expect(wf["3"].class_type).toBe("ImageUpscaleWithModel");
    });

    it("RealESRGAN x4 uses correct model", () => {
      const wf = buildUpscaleWorkflow({ imageName: "test.png", method: "ai_realesrgan", scale: 4 });
      expect(wf["2"].inputs.model_name).toBe("RealESRGAN_x4plus.pth");
    });

    it("RealESRGAN x2 uses correct model", () => {
      const wf = buildUpscaleWorkflow({ imageName: "test.png", method: "ai_realesrgan_x2", scale: 2 });
      expect(wf["2"].inputs.model_name).toBe("RealESRGAN_x2plus.pth");
    });

    it("Anime uses correct model", () => {
      const wf = buildUpscaleWorkflow({ imageName: "test.png", method: "ai_anime", scale: 4 });
      expect(wf["2"].inputs.model_name).toBe("RealESRGAN_x4plus_anime_6B.pth");
    });
  });

  describe("Classic upscale", () => {
    it("lanczos uses ImageScaleBy", () => {
      const wf = buildUpscaleWorkflow({ imageName: "test.png", method: "lanczos", scale: 2 });
      expect(wf["2"].class_type).toBe("ImageScaleBy");
      expect(wf["2"].inputs.upscale_method).toBe("lanczos");
      expect(wf["2"].inputs.scale_by).toBe(2);
    });
  });

  describe("Common", () => {
    it("all methods have SaveImage", () => {
      for (const method of ["ai_ultrasharp", "ai_realesrgan", "lanczos", "bicubic"]) {
        const wf = buildUpscaleWorkflow({ imageName: "test.png", method, scale: 2 });
        expect(Object.values(wf).some((n: any) => n.class_type === "SaveImage")).toBe(true);
      }
    });

    it("loads input image", () => {
      const wf = buildUpscaleWorkflow({ imageName: "my_image.png", method: "ai_ultrasharp", scale: 2 });
      expect(wf["1"].class_type).toBe("LoadImage");
      expect(wf["1"].inputs.image).toBe("my_image.png");
    });
  });
});
