import { describe, it, expect } from "vitest";
import { buildInpaintWorkflow } from "../workflows/inpaint";

const baseParams = {
  imgName: "ball.png", maskName: "mask.png", samMaskRef: null as [string, number] | null,
  prompt: "water droplets", seed: 42, steps: 20, cfg: 4, denoise: 0.85,
};

describe("buildInpaintWorkflow", () => {
  describe("FLUX.1 Fill", () => {
    const wf = buildInpaintWorkflow({ ...baseParams, modelType: "flux1-fill" });

    it("uses FLUX.1 Fill model", () => {
      const nodes = Object.values(wf);
      const unet = nodes.find((n: any) => n.class_type === "UNETLoader");
      expect((unet as any).inputs.unet_name).toBe("flux1-fill-dev.safetensors");
    });

    it("uses InpaintModelConditioning", () => {
      const nodes = Object.values(wf);
      expect(nodes.some((n: any) => n.class_type === "InpaintModelConditioning")).toBe(true);
    });

    it("always denoise 1.0", () => {
      const nodes = Object.values(wf);
      const sampler = nodes.find((n: any) => n.class_type === "KSampler");
      expect((sampler as any).inputs.denoise).toBe(1.0);
    });

    it("has preserve original (ImageCompositeMasked)", () => {
      const nodes = Object.values(wf);
      expect(nodes.some((n: any) => n.class_type === "ImageCompositeMasked")).toBe(true);
    });
  });

  describe("Klein 9B", () => {
    const wf = buildInpaintWorkflow({ ...baseParams, modelType: "klein-9b" });

    it("uses Klein 9B model", () => {
      const nodes = Object.values(wf);
      const unet = nodes.find((n: any) => n.class_type === "UNETLoader");
      expect((unet as any).inputs.unet_name).toBe("flux-2-klein-9b.safetensors");
    });

    it("uses SetLatentNoiseMask", () => {
      const nodes = Object.values(wf);
      expect(nodes.some((n: any) => n.class_type === "SetLatentNoiseMask")).toBe(true);
    });

    it("passes denoise value", () => {
      const nodes = Object.values(wf);
      const sampler = nodes.find((n: any) => n.class_type === "KSampler");
      expect((sampler as any).inputs.denoise).toBe(0.85);
    });
  });

  describe("Klein 4B", () => {
    const wf = buildInpaintWorkflow({ ...baseParams, modelType: "klein-4b" });

    it("uses Klein 4B model", () => {
      const nodes = Object.values(wf);
      const unet = nodes.find((n: any) => n.class_type === "UNETLoader");
      expect((unet as any).inputs.unet_name).toBe("flux-2-klein-4b.safetensors");
    });

    it("uses ModelSamplingFlux with shift 3.0", () => {
      const nodes = Object.values(wf);
      const shift = nodes.find((n: any) => n.class_type === "ModelSamplingFlux");
      expect(shift).toBeDefined();
      expect((shift as any).inputs.max_shift).toBe(3.0);
    });

    it("uses DDIM sampler with sgm_uniform", () => {
      const nodes = Object.values(wf);
      const sampler = nodes.find((n: any) => n.class_type === "KSampler");
      expect((sampler as any).inputs.sampler_name).toBe("ddim");
      expect((sampler as any).inputs.scheduler).toBe("sgm_uniform");
    });
  });

  describe("SD 1.5 Inpainting", () => {
    const wf = buildInpaintWorkflow({ ...baseParams, modelType: "sd15-inpaint" });

    it("uses SD 1.5 checkpoint", () => {
      const nodes = Object.values(wf);
      const ckpt = nodes.find((n: any) => n.class_type === "CheckpointLoaderSimple");
      expect((ckpt as any).inputs.ckpt_name).toBe("sd-v1-5-inpainting.ckpt");
    });

    it("uses VAEEncodeForInpaint", () => {
      const nodes = Object.values(wf);
      expect(nodes.some((n: any) => n.class_type === "VAEEncodeForInpaint")).toBe(true);
    });
  });

  describe("All models", () => {
    const models = ["flux1-fill", "klein-9b", "klein-4b", "sdxl-inpaint", "sd15-inpaint"];

    models.forEach((modelType) => {
      it(`${modelType}: has SaveImage`, () => {
        const wf = buildInpaintWorkflow({ ...baseParams, modelType });
        expect(Object.values(wf).some((n: any) => n.class_type === "SaveImage")).toBe(true);
      });

      it(`${modelType}: has preserve original`, () => {
        const wf = buildInpaintWorkflow({ ...baseParams, modelType });
        expect(Object.values(wf).some((n: any) => n.class_type === "ImageCompositeMasked")).toBe(true);
      });
    });
  });
});
