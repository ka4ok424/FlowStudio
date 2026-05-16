import templateRaw from "./ltxLora.template.json";

export interface LtxLoraParams {
  prompt: string;
  width: number;
  height: number;
  fps: number;
  frames: number;          // user-facing frame count; converted to lengthSec internally
  cfg: number;
  steps: number;
  seed: number;
  firstFrameStrength: number;
  lastFrameStrength: number;
  loraOn: boolean;
  loraName: string;
  loraStrength: number;
  promptEnhancer: boolean;
  firstFrameFile: string;
  lastFrameFile: string;
  // ALWAYS provide a valid audio filename — ComfyUI validates LoadAudio's
  // combo even when the audio chain is switched off. Use a silent WAV
  // placeholder when the user hasn't connected audio.
  audioFile: string;
  audioWasProvided: boolean;         // controls the Custom Audio switch (node 2186)
  useVocalsOnly: boolean;
  trimStart: number;                 // seconds
  trimDuration: number;              // seconds; 0 = auto-match video duration
}

/**
 * Build the LTX 2.3 FLF2V (First-Last-Frame to Video) ComfyUI workflow,
 * patching only specific node values inside the canonical template JSON.
 *
 * The template is the user's saved workflow from ComfyUI
 * (`LTX-2.3_-_FLF2V_First-Last-Frame_transition_lora_flow_studio.json`).
 * DO NOT restructure it here — we just inject the run-time parameters.
 *
 * Key node IDs in the template (stable so long as the JSON isn't rewritten):
 *   45   LoadImage  — FIRST FRAME
 *   47   LoadImage  — LAST FRAME
 *   2076 PrimitiveFloat — FPS
 *   2078 INTConstant — LENGTH (in seconds)
 *   2079 INTConstant — HEIGHT
 *   2080 INTConstant — WIDTH
 *   2082 PrimitiveBoolean — ENABLE PROMPT ENHANCER
 *   2103 PrimitiveStringMultiline — PROMPT
 *   2107 Power Lora Loader (rgthree) — transition LoRA (.lora_1.on / .lora / .strength)
 *   2108 PrimitiveFloat — LAST FRAME STRENGTH
 *   2110 PrimitiveFloat — FIRST FRAME STRENGTH
 *   2180 TrimAudioDuration — start_index + duration
 *   2183 LoadAudio — audio file
 *   2186 ComfySwitchNode — Custom Audio (true) vs LTX-generated audio (false)
 *   2191 ComfySwitchNode — Use Vocals Only (true via MelBandRoformer) vs raw trim (false)
 *   2 / 8 / 36 / 14 / 15 — sampler params (steps, cfg, seeds)
 *   187 / 2176 / 180 — model/vae loaders (paths normalised to forward slashes for Linux)
 */
export function buildLtxLoraWorkflow(p: LtxLoraParams): Record<string, any> {
  // Deep clone so successive runs can't pollute the template.
  const wf: Record<string, any> = JSON.parse(JSON.stringify(templateRaw));

  // --- Geometry ---
  // Workflow's native parameter is LENGTH in seconds; node 2077 then computes
  // total frames via ((round((length*fps - 1) / 8)) * 8) + 1. We expose
  // `frames` to the user and back-solve length so the calculator lands close
  // to the requested count.
  const lengthSec = Math.max(1, Math.round((p.frames - 1) / p.fps));
  wf["2080"].inputs.value = p.width;
  wf["2079"].inputs.value = p.height;
  wf["2076"].inputs.value = p.fps;
  wf["2078"].inputs.value = lengthSec;

  // --- Prompt ---
  // The enhancer toggle (2082) alone doesn't prevent the LLM from running:
  // 2070:486 is OUTPUT_NODE=True and unconditionally pulls 2070:485
  // (TextGenerateLTX2Prompt → Gemma 3 12B). Strip the whole chain when off so
  // CLIPTextEncode 16 reads raw prompt 2103 directly — saves ~5-10s of GPU
  // time per run.
  wf["2103"].inputs.value = p.prompt;
  wf["2082"].inputs.value = p.promptEnhancer;
  if (!p.promptEnhancer) {
    const enhancerNodes = [
      "2070:482", "2070:484", "2070:485", "2070:486", "2070:2002", "2070:2193",
      "2102:2085", "2102:2092", "2102:2098", "2102:2099", "2102:2100",
    ];
    for (const id of enhancerNodes) delete wf[id];
    if (wf["16"])   wf["16"].inputs.text     = ["2103", 0];
    if (wf["2071"]) wf["2071"].inputs.source = ["2103", 0];
  }

  // --- Sampler ---
  wf["8"].inputs.cfg = p.cfg;
  wf["36"].inputs.cfg = p.cfg;
  wf["2"].inputs.steps = p.steps;
  wf["15"].inputs.noise_seed = p.seed;
  wf["14"].inputs.noise_seed = p.seed + 1;

  // --- Frame guidance strengths ---
  wf["2110"].inputs.value = p.firstFrameStrength;
  wf["2108"].inputs.value = p.lastFrameStrength;

  // --- Transition LoRA (rgthree Power Lora Loader) ---
  wf["2107"].inputs.lora_1.on = p.loraOn;
  if (p.loraName) wf["2107"].inputs.lora_1.lora = p.loraName;
  wf["2107"].inputs.lora_1.strength = p.loraStrength;

  // --- Frame images ---
  wf["45"].inputs.image = p.firstFrameFile;
  wf["47"].inputs.image = p.lastFrameFile;

  // --- Audio routing ---
  // LoadAudio is fed a valid filename in ALL cases (custom file when the user
  // supplied audio, silent placeholder otherwise). ComfySwitch 2186 then
  // decides whether the audio chain feeds the model or LTX auto-generates.
  wf["2183"].inputs.audio = p.audioFile;
  if (p.audioWasProvided) {
    wf["2186"].inputs.switch = true;                  // use the uploaded audio
    wf["2191"].inputs.switch = p.useVocalsOnly;       // vocals-only ON/OFF
    wf["2180"].inputs.start_index = p.trimStart;
    if (p.trimDuration > 0) {
      wf["2180"].inputs.duration = p.trimDuration;
    }
    // If trimDuration === 0, keep the original connection to node 2173
    // (frames / fps = full video length).
  } else {
    wf["2186"].inputs.switch = false;                 // LTX-generated audio
    wf["2191"].inputs.switch = false;                 // doesn't matter, branch unused
  }

  return wf;
}
