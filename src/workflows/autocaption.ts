// Small helper: build a ComfyUI workflow that captions a single image using
// the patched ComfyUI_SLK_joy_caption_two or kijai's ComfyUI-Florence2 plugin.
// Used by Dataset node for auto-captioning when the user didn't provide text.

export interface FlorenceCaptionOpts {
  model: "florence2";
  imageName: string;
  florenceModel?: string;   // default: microsoft/Florence-2-base
  task?: string;            // default: detailed_caption
}

export interface JoyCaptionOpts {
  model: "joycaption";
  imageName: string;
  joyModel?: string;        // default: unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit
  captionType?: string;     // e.g. "Descriptive" or "Training Prompt"
  captionLength?: string;   // e.g. "long"
}

export function buildAutoCaptionWorkflow(p: FlorenceCaptionOpts | JoyCaptionOpts): Record<string, any> {
  const wf: Record<string, any> = {};
  wf["1"] = { class_type: "LoadImage", inputs: { image: p.imageName } };

  if (p.model === "florence2") {
    wf["2"] = {
      class_type: "DownloadAndLoadFlorence2Model",
      inputs: {
        model: p.florenceModel || "microsoft/Florence-2-base",
        precision: "fp16",
        attention: "sdpa",
      },
    };
    wf["3"] = {
      class_type: "Florence2Run",
      inputs: {
        image: ["1", 0],
        florence2_model: ["2", 0],
        text_input: "",
        task: p.task || "detailed_caption",
        fill_mask: false,
        keep_model_loaded: true,
        max_new_tokens: 1024,
        num_beams: 3,
        do_sample: false,
        output_mask_select: "",
        seed: 1,
      },
    };
    wf["4"] = { class_type: "PreviewAny", inputs: { source: ["3", 2] } };
    return wf;
  }

  // JoyCaption
  wf["2"] = {
    class_type: "Joy_caption_two_load",
    inputs: { model: p.joyModel || "unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit" },
  };
  wf["3"] = {
    class_type: "Joy_caption_two",
    inputs: {
      joy_two_pipeline: ["2", 0],
      image: ["1", 0],
      caption_type: p.captionType || "Descriptive",
      caption_length: p.captionLength || "medium-length",
      low_vram: false,
    },
  };
  wf["4"] = { class_type: "PreviewAny", inputs: { source: ["3", 0] } };
  return wf;
}
