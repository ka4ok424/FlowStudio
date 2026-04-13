import { describe, it, expect } from "vitest";
import { buildInpaintWorkflow } from "../workflows/inpaint";

const baseParams = {
  imgName: "ball.png", maskName: "mask.png", samMaskRef: null as [string, number] | null,
  prompt: "water droplets", seed: 42, steps: 20, cfg: 4, denoise: 0.85,
};

describe("buildInpaintWorkflow", () => {
  describe("FLUX.1 Fill (official)", () => {
    const wf = buildInpaintWorkflow({ ...baseParams, modelType: "flux1-fill" });
    const nodes = Object.values(wf);

    it("uses FLUX.1 Fill model", () => {
      const unet = nodes.find((n: any) => n.class_type === "UNETLoader");
      expect((unet as any).inputs.unet_name).toBe("flux1-fill-dev.safetensors");
    });

    it("uses DifferentialDiffusion", () => {
      expect(nodes.some((n: any) => n.class_type === "DifferentialDiffusion")).toBe(true);
    });

    it("uses FluxGuidance with guidance 30", () => {
      const fg = nodes.find((n: any) => n.class_type === "FluxGuidance");
      expect(fg).toBeDefined();
      expect((fg as any).inputs.guidance).toBe(30.0);
    });

    it("uses InpaintModelConditioning with noise_mask=false", () => {
      const cond = nodes.find((n: any) => n.class_type === "InpaintModelConditioning");
      expect(cond).toBeDefined();
      expect((cond as any).inputs.noise_mask).toBe(false);
    });

    it("KSampler uses CFG 1.0 and denoise 1.0", () => {
      const sampler = nodes.find((n: any) => n.class_type === "KSampler");
      expect((sampler as any).inputs.cfg).toBe(1.0);
      expect((sampler as any).inputs.denoise).toBe(1.0);
    });

    it("uses DualCLIPLoader (not single CLIPLoader)", () => {
      expect(nodes.some((n: any) => n.class_type === "DualCLIPLoader")).toBe(true);
    });
  });

  describe("Klein 9B (official)", () => {
    const wf = buildInpaintWorkflow({ ...baseParams, modelType: "klein-9b" });
    const nodes = Object.values(wf);

    it("uses SetLatentNoiseMask", () => {
      expect(nodes.some((n: any) => n.class_type === "SetLatentNoiseMask")).toBe(true);
    });

    it("denoise always 1.0", () => {
      const sampler = nodes.find((n: any) => n.class_type === "KSampler");
      expect((sampler as any).inputs.denoise).toBe(1.0);
    });

    it("CFG always 1.0", () => {
      const sampler = nodes.find((n: any) => n.class_type === "KSampler");
      expect((sampler as any).inputs.cfg).toBe(1.0);
    });
  });

  describe("Klein 4B", () => {
    const wf = buildInpaintWorkflow({ ...baseParams, modelType: "klein-4b" });
    const nodes = Object.values(wf);

    it("uses Klein 4B model", () => {
      const unet = nodes.find((n: any) => n.class_type === "UNETLoader");
      expect((unet as any).inputs.unet_name).toBe("flux-2-klein-4b.safetensors");
    });

    it("uses 4 steps", () => {
      const sampler = nodes.find((n: any) => n.class_type === "KSampler");
      expect((sampler as any).inputs.steps).toBe(4);
    });
  });

  describe("SDXL Inpainting (official)", () => {
    const wf = buildInpaintWorkflow({ ...baseParams, modelType: "sdxl-inpaint" });
    const nodes = Object.values(wf);

    it("uses separate UNETLoader for inpaint model", () => {
      const unets = nodes.filter((n: any) => n.class_type === "UNETLoader");
      expect(unets.length).toBe(1);
      expect((unets[0] as any).inputs.unet_name).toBe("sdxl-inpainting.safetensors");
    });

    it("uses CheckpointLoaderSimple for CLIP/VAE", () => {
      const ckpt = nodes.find((n: any) => n.class_type === "CheckpointLoaderSimple");
      expect((ckpt as any).inputs.ckpt_name).toBe("sd_xl_base_1.0.safetensors");
    });

    it("uses InpaintModelConditioning", () => {
      expect(nodes.some((n: any) => n.class_type === "InpaintModelConditioning")).toBe(true);
    });
  });

  describe("SD 1.5 Inpainting (official)", () => {
    const wf = buildInpaintWorkflow({ ...baseParams, modelType: "sd15-inpaint" });
    const nodes = Object.values(wf);

    it("uses sd-v1-5-inpainting checkpoint", () => {
      const ckpt = nodes.find((n: any) => n.class_type === "CheckpointLoaderSimple");
      expect((ckpt as any).inputs.ckpt_name).toBe("sd-v1-5-inpainting.ckpt");
    });

    it("uses VAEEncodeForInpaint", () => {
      expect(nodes.some((n: any) => n.class_type === "VAEEncodeForInpaint")).toBe(true);
    });

    it("uses uni_pc_bh2 sampler", () => {
      const sampler = nodes.find((n: any) => n.class_type === "KSampler");
      expect((sampler as any).inputs.sampler_name).toBe("uni_pc_bh2");
    });
  });

  describe("All models", () => {
    const models = ["flux1-fill", "klein-9b", "klein-4b", "sdxl-inpaint", "sd15-inpaint"];

    models.forEach((modelType) => {
      it(`${modelType}: has SaveImage`, () => {
        const wf = buildInpaintWorkflow({ ...baseParams, modelType });
        expect(Object.values(wf).some((n: any) => n.class_type === "SaveImage")).toBe(true);
      });

      it(`${modelType}: denoise is 1.0`, () => {
        const wf = buildInpaintWorkflow({ ...baseParams, modelType });
        const sampler = Object.values(wf).find((n: any) => n.class_type === "KSampler");
        expect((sampler as any).inputs.denoise).toBe(1.0);
      });
    });
  });
});
