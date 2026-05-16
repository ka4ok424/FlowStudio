import templateRaw from "./ltxFL.template.json";

export interface LtxFLParams {
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
}

/**
 * Build the LTX 2.3 FLF2V basic workflow (NOT the transition_lora variant —
 * for that see ltxFlf.ts / fs:ltxFlf). Sourced from
 * `LTX-2.3_-_FLF2V_First-Last-Frame.json`. No audio mux chain, simpler
 * LoraLoaderModelOnly (bypassed in source GUI), same UNETLoader 187 base.
 *
 * Key node IDs:
 *   45   LoadImage  — FIRST FRAME
 *   47   LoadImage  — LAST FRAME
 *   2076 PrimitiveFloat — FPS
 *   2078 INTConstant — LENGTH (in seconds)
 *   2079 INTConstant — HEIGHT
 *   2080 INTConstant — WIDTH
 *   2082 PrimitiveBoolean — ENABLE PROMPT ENHANCER
 *   2103 PrimitiveStringMultiline — PROMPT
 *   2107 Power Lora Loader (rgthree) — disabled
 *   2108 PrimitiveFloat — LAST FRAME STRENGTH
 *   2110 PrimitiveFloat — FIRST FRAME STRENGTH
 *   2 / 8 / 36 / 14 / 15 — sampler params
 */
export function buildLtxFLWorkflow(p: LtxFLParams): Record<string, any> {
  const wf: Record<string, any> = JSON.parse(JSON.stringify(templateRaw));

  // Geometry — back-solve LENGTH (seconds) from user-facing frames.
  const lengthSec = Math.max(1, Math.round((p.frames - 1) / p.fps));
  wf["2080"].inputs.value = p.width;
  wf["2079"].inputs.value = p.height;
  wf["2076"].inputs.value = p.fps;
  wf["2078"].inputs.value = lengthSec;

  // Prompt + enhancer toggle. Enhancer chain uses ComfySwitchNode (NOT lazy)
  // so 2070:485 TextGenerateLTX2Prompt runs unconditionally unless we strip
  // the subchain — same fix as FLF/FML/Lora builders.
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

  // Sampler
  wf["8"].inputs.cfg = p.cfg;
  wf["36"].inputs.cfg = p.cfg;
  wf["2"].inputs.steps = p.steps;
  wf["15"].inputs.noise_seed = p.seed;
  wf["14"].inputs.noise_seed = p.seed + 1;

  // Frame guidance strengths
  wf["2110"].inputs.value = p.firstFrameStrength;
  wf["2108"].inputs.value = p.lastFrameStrength;

  // LoRA off (pass-through)
  wf["2107"].inputs.lora_1.on = false;

  // Frame images
  wf["45"].inputs.image = p.firstFrameFile;
  wf["47"].inputs.image = p.lastFrameFile;

  return wf;
}
