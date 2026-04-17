// Image-to-text workflow: Florence-2 or JoyCaption Alpha Two.
// Both pipelines end with a PreviewAny node so the generated text is surfaced
// in ComfyUI's /history output under the PreviewAny node id.

export type DescribeModel = "florence2" | "joycaption";

export interface DescribeFlorenceParams {
  model: "florence2";
  imageName: string;
  florenceModel: string;            // e.g. "microsoft/Florence-2-base"
  task: string;                     // e.g. "detailed_caption"
  textInput?: string;               // for phrase_grounding / referring_expression tasks
  maxNewTokens: number;
  numBeams: number;
  doSample: boolean;
  seed: number;
  precision: "fp16" | "bf16" | "fp32";
  keepLoaded: boolean;
}

export interface DescribeJoyParams {
  model: "joycaption";
  imageName: string;
  joyModel: string;                 // e.g. "unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit"
  captionType: string;              // "Descriptive" etc.
  captionLength: string;            // "medium-length" | "100" | "any" etc.
  personName: string;
  customPrompt: string;
  lowVram: boolean;
  topP: number;
  temperature: number;
  extras: Record<string, boolean>;  // map of extra-options flags
}

// Canonical keys the Joy_extra_options ComfyUI node expects.
// Keep this in sync with the Properties panel checkbox labels.
export const JOY_EXTRAS_KEYS = {
  usePersonName: "If there is a person/character in the image you must refer to them as {name}.",
  noImmutableTraits: "Do NOT include information about people/characters that cannot be changed (like ethnicity, gender, etc), but do still include changeable attributes (like hair style).",
  lighting: "Include information about lighting.",
  cameraAngle: "Include information about camera angle.",
  watermark: "Include information about whether there is a watermark or not.",
  jpegArtifacts: "Include information about whether there are JPEG artifacts or not.",
  cameraDetails: "If it is a photo you MUST include information about what camera was likely used and details such as aperture, shutter speed, ISO, etc.",
  noSexual: "Do NOT include anything sexual; keep it PG.",
  noResolution: "Do NOT mention the image's resolution.",
  aestheticQuality: "You MUST include information about the subjective aesthetic quality of the image from low to very high.",
  composition: "Include information on the image's composition style, such as leading lines, rule of thirds, or symmetry.",
  noText: "Do NOT mention any text that is in the image.",
  depthOfField: "Specify the depth of field and whether the background is in focus or blurred.",
  lightingSources: "If applicable, mention the likely use of artificial or natural lighting sources.",
  noAmbiguous: "Do NOT use any ambiguous language.",
  sfwNsfw: "Include whether the image is sfw, suggestive, or nsfw.",
  importantOnly: "ONLY describe the most important elements of the image.",
} as const;

export type JoyExtraKey = keyof typeof JOY_EXTRAS_KEYS;

export function buildDescribeWorkflow(p: DescribeFlorenceParams | DescribeJoyParams): Record<string, any> {
  const wf: Record<string, any> = {};
  wf["1"] = { class_type: "LoadImage", inputs: { image: p.imageName } };

  if (p.model === "florence2") {
    wf["2"] = {
      class_type: "DownloadAndLoadFlorence2Model",
      inputs: { model: p.florenceModel, precision: p.precision, attention: "sdpa" },
    };
    wf["3"] = {
      class_type: "Florence2Run",
      inputs: {
        image: ["1", 0],
        florence2_model: ["2", 0],
        text_input: p.textInput || "",
        task: p.task,
        fill_mask: false,
        keep_model_loaded: p.keepLoaded,
        max_new_tokens: p.maxNewTokens,
        num_beams: p.numBeams,
        do_sample: p.doSample,
        output_mask_select: "",
        seed: p.seed,
      },
    };
    // Florence2Run outputs [image, mask, caption(STRING), data(JSON)] — index 2 is the caption text.
    wf["4"] = { class_type: "PreviewAny", inputs: { source: ["3", 2] } };
    return wf;
  }

  // JoyCaption Alpha Two
  wf["2"] = { class_type: "Joy_caption_two_load", inputs: { model: p.joyModel } };

  // Build Joy_extra_options: each flag is a boolean input with its long-string key.
  const extrasInputs: Record<string, any> = {};
  for (const [short, fullKey] of Object.entries(JOY_EXTRAS_KEYS)) {
    extrasInputs[fullKey] = !!p.extras[short];
  }
  wf["3"] = { class_type: "Joy_extra_options", inputs: extrasInputs };

  wf["4"] = {
    class_type: "Joy_caption_two_advanced",
    inputs: {
      joy_two_pipeline: ["2", 0],
      image: ["1", 0],
      extra_options: ["3", 0],
      caption_type: p.captionType,
      caption_length: p.captionLength,
      name: p.personName || "",
      custom_prompt: p.customPrompt || "",
      low_vram: p.lowVram,
      top_p: p.topP,
      temperature: p.temperature,
    },
  };
  wf["5"] = { class_type: "PreviewAny", inputs: { source: ["4", 0] } };
  return wf;
}
