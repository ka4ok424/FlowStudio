import templateRaw from "./ltxFlf.template.json";

export interface LtxFlfParams {
  prompt: string;
  width: number;
  height: number;
  fps: number;
  frames: number;
  cfg: number;
  steps: number;
  seed: number;
  firstFrameStrength: number;
  lastFrameStrength: number;
  promptEnhancer: boolean;
  firstFrameFile: string;
  lastFrameFile: string;
  // LoadAudio is fed a silent WAV placeholder — ComfySwitch 2186 routes the
  // audio chain away (LTX auto-generates audio), but ComfyUI still validates
  // LoadAudio's combo against a real file in input/.
  silentAudioFile: string;
}

/**
 * Build the LTX 2.3 FLF2V (First-Last-Frame to Video) ComfyUI workflow.
 *
 * Simpler sibling of `buildLtxLoraWorkflow`: no audio input, no LoRA toggle
 * (transition LoRA stays disabled for clean motion), no vocals/trim controls.
 * Patches only run-time values inside the canonical template JSON.
 */
export function buildLtxFlfWorkflow(p: LtxFlfParams): Record<string, any> {
  const wf: Record<string, any> = JSON.parse(JSON.stringify(templateRaw));

  // Workflow's native parameter is LENGTH (seconds); node 2077 then computes
  // total frames via ((round((length*fps - 1) / 8)) * 8) + 1. We expose
  // `frames` and back-solve length so the calculator lands near the request.
  const lengthSec = Math.max(1, Math.round((p.frames - 1) / p.fps));
  wf["2080"].inputs.value = p.width;
  wf["2079"].inputs.value = p.height;
  wf["2076"].inputs.value = p.fps;
  wf["2078"].inputs.value = lengthSec;

  // Enhancer toggle alone doesn't stop the LLM from running — 2070:486 is
  // OUTPUT_NODE=True and pulls 2070:485 unconditionally. Strip the chain
  // when off so CLIPTextEncode 16 reads raw prompt 2103 directly.
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

  wf["8"].inputs.cfg = p.cfg;
  wf["36"].inputs.cfg = p.cfg;
  wf["2"].inputs.steps = p.steps;
  wf["15"].inputs.noise_seed = p.seed;
  wf["14"].inputs.noise_seed = p.seed + 1;

  wf["2110"].inputs.value = p.firstFrameStrength;
  wf["2108"].inputs.value = p.lastFrameStrength;

  // Transition LoRA off — keep the rgthree loader present (graph integrity)
  // but disable the slot so the base model runs clean.
  wf["2107"].inputs.lora_1.on = false;

  wf["45"].inputs.image = p.firstFrameFile;
  wf["47"].inputs.image = p.lastFrameFile;

  // Audio chain: silent placeholder + switch off custom audio so LTX
  // generates its own track from the video conditioning.
  wf["2183"].inputs.audio = p.silentAudioFile;
  wf["2186"].inputs.switch = false;
  wf["2191"].inputs.switch = false;

  return wf;
}
