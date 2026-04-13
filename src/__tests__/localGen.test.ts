import { describe, it, expect } from "vitest";
import { buildLocalGenWorkflow } from "../workflows/localGen";

const baseParams = { prompt: "a cat", seed: 12345, steps: 4, cfg: 1, width: 512, height: 512 };

describe("buildLocalGenWorkflow", () => {
  describe("Klein 9B", () => {
    const wf = buildLocalGenWorkflow({ ...baseParams, model: "flux-2-klein-9b.safetensors" });

    it("uses UNETLoader", () => {
      expect(wf["1"].class_type).toBe("UNETLoader");
      expect(wf["1"].inputs.unet_name).toBe("flux-2-klein-9b.safetensors");
    });

    it("uses Qwen 8B encoder", () => {
      expect(wf["2"].class_type).toBe("CLIPLoader");
      expect(wf["2"].inputs.clip_name).toBe("qwen3_8b_klein9b.safetensors");
      expect(wf["2"].inputs.type).toBe("flux2");
    });

    it("uses flux2-vae", () => {
      expect(wf["3"].inputs.vae_name).toBe("flux2-vae.safetensors");
    });

    it("sets CFG to 1.0 for Klein", () => {
      expect(wf["6"].inputs.cfg).toBe(1.0);
    });

    it("has SaveImage as last node", () => {
      expect(wf["8"].class_type).toBe("SaveImage");
    });

    it("connects all nodes correctly", () => {
      expect(wf["4"].inputs.clip).toEqual(["2", 0]); // CLIPTextEncode → CLIPLoader
      expect(wf["6"].inputs.model).toEqual(["1", 0]); // KSampler → UNETLoader
      expect(wf["6"].inputs.positive).toEqual(["4", 0]); // KSampler → CLIPTextEncode
      expect(wf["6"].inputs.latent_image).toEqual(["5", 0]); // KSampler → EmptyLatent
      expect(wf["7"].inputs.samples).toEqual(["6", 0]); // VAEDecode → KSampler
      expect(wf["8"].inputs.images).toEqual(["7", 0]); // SaveImage → VAEDecode
    });
  });

  describe("Klein 4B", () => {
    const wf = buildLocalGenWorkflow({ ...baseParams, model: "flux-2-klein-4b.safetensors" });

    it("uses Qwen 4B encoder", () => {
      expect(wf["2"].inputs.clip_name).toBe("qwen_3_4b_fp4_flux2.safetensors");
    });

    it("sets CFG to 1.0 for Klein", () => {
      expect(wf["6"].inputs.cfg).toBe(1.0);
    });
  });

  describe("FLUX.2 Dev FP8", () => {
    const wf = buildLocalGenWorkflow({ ...baseParams, model: "flux2_dev_fp8mixed.safetensors", cfg: 3.5 });

    it("uses Mistral encoder", () => {
      expect(wf["2"].inputs.clip_name).toBe("mistral_3_small_flux2_fp8.safetensors");
    });

    it("uses user CFG (not forced 1.0)", () => {
      expect(wf["6"].inputs.cfg).toBe(3.5);
    });
  });

  describe("GGUF model", () => {
    const wf = buildLocalGenWorkflow({ ...baseParams, model: "flux1-dev-Q8_0.gguf" });

    it("uses UnetLoaderGGUF", () => {
      expect(wf["1"].class_type).toBe("UnetLoaderGGUF");
    });

    it("uses DualCLIPLoader with CLIP-L + T5", () => {
      expect(wf["2"].class_type).toBe("DualCLIPLoader");
      expect(wf["2"].inputs.clip_name1).toBe("clip_l.safetensors");
      expect(wf["2"].inputs.clip_name2).toBe("t5xxl_fp8_e4m3fn.safetensors");
    });

    it("uses ae.safetensors VAE", () => {
      expect(wf["3"].inputs.vae_name).toBe("ae.safetensors");
    });
  });

  describe("Standard SD checkpoint", () => {
    const wf = buildLocalGenWorkflow({ ...baseParams, model: "dreamshaper_xl.safetensors", cfg: 7 });

    it("uses CheckpointLoaderSimple", () => {
      expect(wf["1"].class_type).toBe("CheckpointLoaderSimple");
    });

    it("has separate positive and negative prompts", () => {
      expect(wf["2"].class_type).toBe("CLIPTextEncode");
      expect(wf["3"].class_type).toBe("CLIPTextEncode");
      expect(wf["3"].inputs.text).toBe(""); // negative is empty
    });

    it("uses EmptyLatentImage (not SD3)", () => {
      expect(wf["4"].class_type).toBe("EmptyLatentImage");
    });
  });

  describe("SD3 checkpoint", () => {
    const wf = buildLocalGenWorkflow({ ...baseParams, model: "sd3.5_medium.safetensors" });

    it("uses EmptySD3LatentImage", () => {
      expect(wf["4"].class_type).toBe("EmptySD3LatentImage");
    });
  });

  describe("Common requirements", () => {
    const models = [
      "flux-2-klein-9b.safetensors",
      "flux-2-klein-4b.safetensors",
      "flux2_dev_fp8mixed.safetensors",
      "flux1-dev-Q8_0.gguf",
      "dreamshaper_xl.safetensors",
    ];

    models.forEach((model) => {
      it(`${model}: has SaveImage node`, () => {
        const wf = buildLocalGenWorkflow({ ...baseParams, model });
        const nodes = Object.values(wf);
        expect(nodes.some((n: any) => n.class_type === "SaveImage")).toBe(true);
      });

      it(`${model}: passes prompt text`, () => {
        const wf = buildLocalGenWorkflow({ ...baseParams, model });
        const textNodes = Object.values(wf).filter((n: any) => n.class_type === "CLIPTextEncode");
        expect(textNodes.some((n: any) => n.inputs.text === "a cat")).toBe(true);
      });

      it(`${model}: passes seed`, () => {
        const wf = buildLocalGenWorkflow({ ...baseParams, model });
        const sampler = Object.values(wf).find((n: any) => n.class_type === "KSampler");
        expect((sampler as any).inputs.seed).toBe(12345);
      });
    });
  });
});
