import { describe, it, expect } from "vitest";
import { buildControlNetWorkflow } from "../workflows/controlNet";

const baseParams = {
  imageName: "ref.png",
  prompt: "futuristic city",
  seed: 42,
  steps: 20,
  cfg: 3.5,
  width: 1024,
  height: 1024,
  strength: 0.7,
  startPercent: 0.0,
  endPercent: 1.0,
  controlType: "canny",
  cannyLow: 0.4,
  cannyHigh: 0.8,
};

describe("buildControlNetWorkflow", () => {
  it("uses FLUX.1 Kontext Dev model", () => {
    const wf = buildControlNetWorkflow(baseParams);
    const nodes = Object.values(wf);
    const unet = nodes.find((n: any) => n.class_type === "UNETLoader");
    expect((unet as any).inputs.unet_name).toBe("flux1-kontext-dev.safetensors");
  });

  it("uses DualCLIPLoader with T5+CLIP-L (official order)", () => {
    const wf = buildControlNetWorkflow(baseParams);
    const nodes = Object.values(wf);
    const clip = nodes.find((n: any) => n.class_type === "DualCLIPLoader");
    expect(clip).toBeDefined();
    expect((clip as any).inputs.clip_name1).toBe("t5xxl_fp8_e4m3fn.safetensors");
    expect((clip as any).inputs.clip_name2).toBe("clip_l.safetensors");
    expect((clip as any).inputs.type).toBe("flux");
  });

  it("uses ae.safetensors VAE (FLUX.1)", () => {
    const wf = buildControlNetWorkflow(baseParams);
    const nodes = Object.values(wf);
    const vae = nodes.find((n: any) => n.class_type === "VAELoader");
    expect((vae as any).inputs.vae_name).toBe("ae.safetensors");
  });

  it("uses FluxGuidance instead of KSampler CFG", () => {
    const wf = buildControlNetWorkflow(baseParams);
    const nodes = Object.values(wf);
    const fg = nodes.find((n: any) => n.class_type === "FluxGuidance");
    expect(fg).toBeDefined();
    expect((fg as any).inputs.guidance).toBe(3.5);
    const sampler = nodes.find((n: any) => n.class_type === "KSampler");
    expect((sampler as any).inputs.cfg).toBe(1.0);
  });

  it("does NOT use SetUnionControlNetType (removed in Pro 2.0)", () => {
    const wf = buildControlNetWorkflow(baseParams);
    const nodes = Object.values(wf);
    expect(nodes.some((n: any) => n.class_type === "SetUnionControlNetType")).toBe(false);
  });

  it("loads ControlNet Union Pro 2 model", () => {
    const wf = buildControlNetWorkflow(baseParams);
    const nodes = Object.values(wf);
    const cnLoad = nodes.find((n: any) => n.class_type === "ControlNetLoader");
    expect((cnLoad as any).inputs.control_net_name).toBe("flux-controlnet-union-pro-2.safetensors");
  });

  it("applies Canny preprocessor for canny type", () => {
    const wf = buildControlNetWorkflow(baseParams);
    const nodes = Object.values(wf);
    const canny = nodes.find((n: any) => n.class_type === "Canny");
    expect(canny).toBeDefined();
    expect((canny as any).inputs.low_threshold).toBe(0.4);
    expect((canny as any).inputs.high_threshold).toBe(0.8);
  });

  it("skips Canny preprocessor for non-canny types", () => {
    const wf = buildControlNetWorkflow({ ...baseParams, controlType: "depth" });
    const nodes = Object.values(wf);
    expect(nodes.some((n: any) => n.class_type === "Canny")).toBe(false);
  });

  it("uses ControlNetApplyAdvanced with VAE, strength and percentages", () => {
    const wf = buildControlNetWorkflow(baseParams);
    const nodes = Object.values(wf);
    const apply = nodes.find((n: any) => n.class_type === "ControlNetApplyAdvanced");
    expect(apply).toBeDefined();
    expect((apply as any).inputs.strength).toBe(0.7);
    expect((apply as any).inputs.start_percent).toBe(0.0);
    expect((apply as any).inputs.end_percent).toBe(1.0);
    expect((apply as any).inputs.vae).toBeDefined();
  });

  it("has SaveImage node", () => {
    const wf = buildControlNetWorkflow(baseParams);
    const nodes = Object.values(wf);
    expect(nodes.some((n: any) => n.class_type === "SaveImage")).toBe(true);
  });
});
