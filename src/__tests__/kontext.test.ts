import { describe, it, expect } from "vitest";
import { buildKontextWorkflow } from "../workflows/kontext";

const baseParams = {
  imageName: "test.png", prompt: "add sunglasses", seed: 42,
  steps: 24, cfg: 3.5, sampler: "euler", scheduler: "simple",
  width: 1024, height: 1024,
};

describe("buildKontextWorkflow", () => {
  const wf = buildKontextWorkflow(baseParams);

  it("uses Kontext model", () => {
    expect(wf["1"].class_type).toBe("UNETLoader");
    expect(wf["1"].inputs.unet_name).toBe("flux1-kontext-dev.safetensors");
  });

  it("uses DualCLIPLoader with CLIP-L + T5", () => {
    expect(wf["2"].class_type).toBe("DualCLIPLoader");
    expect(wf["2"].inputs.clip_name1).toBe("clip_l.safetensors");
    expect(wf["2"].inputs.clip_name2).toBe("t5xxl_fp8_e4m3fn.safetensors");
  });

  it("uses ae.safetensors VAE", () => {
    expect(wf["3"].inputs.vae_name).toBe("ae.safetensors");
  });

  it("loads source image", () => {
    expect(wf["5"].class_type).toBe("LoadImage");
    expect(wf["5"].inputs.image).toBe("test.png");
  });

  it("scales image with FluxKontextImageScale", () => {
    expect(wf["6"].class_type).toBe("FluxKontextImageScale");
  });

  it("uses ReferenceLatent for conditioning", () => {
    expect(wf["8"].class_type).toBe("ReferenceLatent");
  });

  it("always uses denoise 1.0", () => {
    expect(wf["10"].inputs.denoise).toBe(1.0);
  });

  it("passes sampler and scheduler", () => {
    expect(wf["10"].inputs.sampler_name).toBe("euler");
    expect(wf["10"].inputs.scheduler).toBe("simple");
  });

  it("uses custom sampler", () => {
    const wf2 = buildKontextWorkflow({ ...baseParams, sampler: "dpmpp_2m", scheduler: "karras" });
    expect(wf2["10"].inputs.sampler_name).toBe("dpmpp_2m");
    expect(wf2["10"].inputs.scheduler).toBe("karras");
  });
});
