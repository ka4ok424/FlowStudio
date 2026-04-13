import { describe, it, expect } from "vitest";
import { buildImg2ImgWorkflow } from "../workflows/img2img";

describe("buildImg2ImgWorkflow", () => {
  const params = {
    imageNames: ["ref1.png", "ref2.png"],
    prompt: "person in park", negativePrompt: "", seed: 99,
    steps: 28, cfg: 3.5, denoise: 0.75, width: 1024, height: 1024,
    sampler: "euler", scheduler: "simple", kvCache: false,
  };

  const wf = buildImg2ImgWorkflow(params);

  it("uses FLUX.2 Dev FP8 model", () => {
    expect(wf["1"].inputs.unet_name).toBe("flux2_dev_fp8mixed.safetensors");
  });

  it("uses Mistral encoder", () => {
    expect(wf["2"].inputs.clip_name).toBe("mistral_3_small_flux2_fp8.safetensors");
  });

  it("creates ReferenceLatent chain for each ref", () => {
    const refs = Object.values(wf).filter((n: any) => n.class_type === "ReferenceLatent");
    expect(refs.length).toBe(2);
  });

  it("loads each reference image", () => {
    const loads = Object.values(wf).filter((n: any) => n.class_type === "LoadImage");
    expect(loads.length).toBe(2);
    expect((loads[0] as any).inputs.image).toBe("ref1.png");
    expect((loads[1] as any).inputs.image).toBe("ref2.png");
  });

  it("single ref: no KV cache", () => {
    const wf1 = buildImg2ImgWorkflow({ ...params, imageNames: ["ref1.png"] });
    const kvNodes = Object.values(wf1).filter((n: any) => n.class_type === "FluxKVCache");
    expect(kvNodes.length).toBe(0);
  });

  it("with KV cache enabled", () => {
    const wf2 = buildImg2ImgWorkflow({ ...params, kvCache: true });
    const kvNodes = Object.values(wf2).filter((n: any) => n.class_type === "FluxKVCache");
    expect(kvNodes.length).toBe(1);
  });

  it("passes negative prompt when provided", () => {
    const wf2 = buildImg2ImgWorkflow({ ...params, negativePrompt: "blurry" });
    const clips = Object.values(wf2).filter((n: any) => n.class_type === "CLIPTextEncode");
    expect(clips.some((n: any) => n.inputs.text === "blurry")).toBe(true);
  });
});
