import { describe, it, expect } from "vitest";
import { buildRemoveBgWorkflow } from "../workflows/removeBg";

describe("buildRemoveBgWorkflow", () => {
  it("loads image and uses BiRefNetRMBG", () => {
    const wf = buildRemoveBgWorkflow({ imageName: "test.png", model: "BiRefNet-general" });
    expect(wf["1"].class_type).toBe("LoadImage");
    expect(wf["1"].inputs.image).toBe("test.png");
    expect(wf["2"].class_type).toBe("BiRefNetRMBG");
    expect(wf["2"].inputs.model).toBe("BiRefNet-general");
  });

  it("passes model variant correctly", () => {
    const wf = buildRemoveBgWorkflow({ imageName: "test.png", model: "BiRefNet-portrait" });
    expect(wf["2"].inputs.model).toBe("BiRefNet-portrait");
  });

  it("sets refine_foreground to true", () => {
    const wf = buildRemoveBgWorkflow({ imageName: "test.png", model: "BiRefNet-general" });
    expect(wf["2"].inputs.refine_foreground).toBe(true);
  });

  it("sets background to Alpha (transparent)", () => {
    const wf = buildRemoveBgWorkflow({ imageName: "test.png", model: "BiRefNet-general" });
    expect(wf["2"].inputs.background).toBe("Alpha");
  });

  it("has SaveImage node", () => {
    const wf = buildRemoveBgWorkflow({ imageName: "test.png", model: "BiRefNet-general" });
    expect(wf["3"].class_type).toBe("SaveImage");
  });
});
