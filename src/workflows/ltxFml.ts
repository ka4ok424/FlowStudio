import templateRaw from "./ltxFml.template.json";

export interface LtxFmlParams {
  prompt: string;
  width: number;
  height: number;
  fps: number;
  frames: number;
  cfg: number;
  steps: number;
  seed: number;
  firstFrameStrength: number;
  middleFrameStrength: number;
  lastFrameStrength: number;
  promptEnhancer: boolean;
  firstFrameFile: string;
  middleFrameFile: string;
  lastFrameFile: string;
}

/**
 * Build the LTX 2.3 FML2V (First-Middle-Last Frame to Video) ComfyUI workflow.
 *
 * Three keyframes + prompt → smooth video. Wraps the user's saved
 * `LTX-2.3_-_FML2V_First_Middle_Last_Frame_guider.json` workflow with
 * SetNode/GetNode indirection resolved and prompt-enhancer subgraph inlined.
 *
 * Key node IDs (stable as long as the template JSON isn't rewritten):
 *   45    LoadImage  — FIRST FRAME
 *   47    LoadImage  — MIDDLE FRAME
 *   2172  LoadImage  — LAST FRAME
 *   2076  PrimitiveFloat — FPS
 *   2078  INTConstant — LENGTH (in seconds)
 *   2079  INTConstant — HEIGHT
 *   2080  INTConstant — WIDTH
 *   2082  PrimitiveBoolean — ENABLE PROMPT ENHANCER
 *   2103  PrimitiveStringMultiline — PROMPT
 *   2107  Power Lora Loader (rgthree) — disabled
 *   2110  PrimitiveFloat — FIRST FRAME STRENGTH  (default 0.7)
 *   2278  PrimitiveFloat — MIDDLE FRAME STRENGTH (default 0.3)
 *   2108  PrimitiveFloat — LAST FRAME STRENGTH   (default 1.0)
 *   2     LTXVScheduler — steps
 *   8/36  CFGGuider — cfg
 *   14/15 RandomNoise — seed
 */
export function buildLtxFmlWorkflow(p: LtxFmlParams): Record<string, any> {
  const wf: Record<string, any> = JSON.parse(JSON.stringify(templateRaw));

  // Geometry — back-solve LENGTH (seconds) from user-facing frame count.
  const lengthSec = Math.max(1, Math.round((p.frames - 1) / p.fps));
  wf["2080"].inputs.value = p.width;
  wf["2079"].inputs.value = p.height;
  wf["2076"].inputs.value = p.fps;
  wf["2078"].inputs.value = lengthSec;

  // Prompt + enhancer.
  // Note: just toggling 2082 (PrimitiveBoolean) does NOT prevent the enhancer
  // from running. ComfyUI executes 2070:486 unconditionally because it's
  // OUTPUT_NODE=True (display-only "Enhanced Prompt" panel), which pulls in
  // 2070:485 TextGenerateLTX2Prompt — i.e. Gemma 3 12B fp8 inference still
  // happens even with the toggle off. To truly skip it, we strip the entire
  // enhancer + split-view subchain and rewire CLIPTextEncode 16 to read raw
  // prompt 2103 directly.
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

  // Three frame guidance strengths
  wf["2110"].inputs.value = p.firstFrameStrength;
  wf["2278"].inputs.value = p.middleFrameStrength;
  wf["2108"].inputs.value = p.lastFrameStrength;

  // LoRA always off — keeps the rgthree loader pass-through, no extra VRAM.
  wf["2107"].inputs.lora_1.on = false;

  // Frame images
  wf["45"].inputs.image    = p.firstFrameFile;
  wf["47"].inputs.image    = p.middleFrameFile;
  wf["2172"].inputs.image  = p.lastFrameFile;

  return wf;
}
