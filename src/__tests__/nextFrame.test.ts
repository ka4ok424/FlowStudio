import { describe, it, expect } from "vitest";
import { buildNextFrameWorkflow } from "../workflows/nextFrame";

describe("buildNextFrameWorkflow", () => {
  const params = {
    imageName: "frame1.png", prompt: "skeleton mid-air dunk",
    negativePrompt: "", seed: 100, steps: 8, cfg: 1.2, denoise: 0.35,
  };

  const wf = buildNextFrameWorkflow(params);

  it("uses Klein 9B model", () => {
    expect(wf["1"].inputs.unet_name).toBe("flux-2-klein-9b.safetensors");
  });

  it("loads source image via VAEEncode", () => {
    expect(wf["4"].class_type).toBe("LoadImage");
    expect(wf["5"].class_type).toBe("VAEEncode");
  });

  it("uses denoise < 1.0", () => {
    expect(wf["8"].inputs.denoise).toBe(0.35);
  });

  it("has separate positive and negative prompts", () => {
    expect(wf["6"].inputs.text).toBe("skeleton mid-air dunk");
    expect(wf["7"].class_type).toBe("CLIPTextEncode");
  });

  it("KSampler uses encoded latent (not empty)", () => {
    expect(wf["8"].inputs.latent_image).toEqual(["5", 0]); // VAEEncode, not EmptyLatent
  });
});
