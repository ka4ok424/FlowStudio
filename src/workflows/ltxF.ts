import templateRaw from "./ltxF.template.json";

export interface LtxFParams {
  prompt: string;
  width: number;
  height: number;
  fps: number;
  frames: number;          // user-facing frame count; back-solved to length seconds
  cfg: number;
  steps: number;
  seed: number;
  promptEnhancer: boolean;
  imageFile: string;       // ComfyUI input/ filename for LoadImage 167
}

/**
 * Build the LTX 2.3 I2V/T2V Basic-for-checkpoint workflow.
 * Sourced from `LTX-2.3_-_I2V_T2V_Basic_for_checkpoint_models.json` with
 * SetNode/GetNode indirection resolved, prompt enhancer subgraph inlined as
 * `5286:*` prefixed nodes, and rgthree UI-only nodes stripped.
 *
 * Uses CheckpointLoaderSimple (`VIDEO/LTX/LTX-2/ltx-2.3-22b-dev-fp8.safetensors`)
 * — single-file fp8 checkpoint containing UNet + CLIP + VAE in one bundle, plus
 * LoraLoaderModelOnly with the distilled-lora-384-1.1 (strength 0.5) on top.
 *
 * Key node IDs:
 *   167  LoadImage  — input image
 *   352  PrimitiveStringMultiline — PROMPT
 *   285  PrimitiveFloat — FPS
 *   291  INTConstant — LENGTH (in seconds)
 *   292  INTConstant — WIDTH
 *   293  INTConstant — HEIGHT
 *   5289 PrimitiveBoolean — ENABLE PROMPT ENHANCER (LazySwitchKJ-routed → no
 *        builder-side strip needed; the enhancer LLM auto-skips when off)
 *   290  PrimitiveBoolean — Text-to-Video toggle (bypass image conditioning).
 *        We force false so the supplied image is always used; pure-T2V can be
 *        a separate future node.
 *   206  LTXVScheduler — steps
 *   103/129 CFGGuider — cfg
 *   114/115 RandomNoise — seed
 *   301  Power Lora Loader (rgthree) — kept in graph with lora_1.on=false
 */
export function buildLtxFWorkflow(p: LtxFParams): Record<string, any> {
  const wf: Record<string, any> = JSON.parse(JSON.stringify(templateRaw));

  // Geometry — back-solve LENGTH (seconds) from user-facing frames.
  const lengthSec = Math.max(1, Math.round((p.frames - 1) / p.fps));
  wf["292"].inputs.value = p.width;
  wf["293"].inputs.value = p.height;
  wf["285"].inputs.value = p.fps;
  wf["291"].inputs.value = lengthSec;

  // Prompt + enhancer toggle (LazySwitchKJ inside the enhancer subgraph
  // makes the off-branch genuinely skip TextGenerateLTX2Prompt — no need to
  // delete the chain like in FLF/FML which use ComfySwitchNode).
  wf["352"].inputs.value = p.prompt;
  wf["5289"].inputs.value = p.promptEnhancer;
  wf["290"].inputs.value = false;                  // I2V mode: use the image

  // Sampler
  wf["103"].inputs.cfg = p.cfg;
  wf["129"].inputs.cfg = p.cfg;
  wf["206"].inputs.steps = p.steps;
  wf["114"].inputs.noise_seed = p.seed;
  wf["115"].inputs.noise_seed = p.seed + 1;

  // LoRA disabled by default (kept in graph for pass-through model wiring)
  wf["301"].inputs.lora_1.on = false;

  // Input image
  wf["167"].inputs.image = p.imageFile;

  return wf;
}
