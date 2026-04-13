export interface RemoveBgParams {
  imageName: string;
  model: string;
}

export function buildRemoveBgWorkflow(p: RemoveBgParams): Record<string, any> {
  return {
    "1": { class_type: "LoadImage", inputs: { image: p.imageName } },
    "2": {
      class_type: "BiRefNetRMBG",
      inputs: {
        image: ["1", 0], model: p.model,
        mask_blur: 0, mask_offset: 0, invert_output: false,
        refine_foreground: true, background: "Alpha", background_color: "#222222",
      },
    },
    "3": { class_type: "SaveImage", inputs: { images: ["2", 0], filename_prefix: `FS_RMBG_${Date.now()}` } },
  };
}
