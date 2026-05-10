import type { OmniVoiceTtsParams } from "./omnivoiceTts";

export interface OmniVoiceCloneParams extends OmniVoiceTtsParams {
  refAudioFileName: string;  // uploaded ref audio file inside ComfyUI input/
  refText: string;           // empty = auto-transcribe via Whisper (loadAsr must be true)
}

/**
 * Build ComfyUI workflow for OmniVoice zero-shot voice cloning.
 *
 *   OmniVoiceModelLoader (load_asr) → OMNIVOICE_MODEL ──┐
 *   LoadAudio(refAudioFileName) → AUDIO ────────────────┤
 *                                                       ↓
 *   OmniVoiceClone(text, ref_audio, ref_text?, language, num_step,
 *                  guidance_scale, denoise, preprocess_prompt,
 *                  postprocess_output, speed, duration, seed, instruct?)
 *                                                       ↓
 *                                              SaveAudio(audio/FS_OMNI_CLONE_<ts>)
 *
 * If refText is empty and loadAsr=true, Whisper auto-transcribes the reference.
 */
export function buildOmniVoiceCloneWorkflow(p: OmniVoiceCloneParams): Record<string, any> {
  const wf: Record<string, any> = {};
  let n = 1;

  const loaderId = String(n++);
  wf[loaderId] = {
    class_type: "OmniVoiceModelLoader",
    inputs: {
      model_path: p.modelPath,
      precision: p.precision,
      load_asr: p.loadAsr,
    },
  };

  const loadAudioId = String(n++);
  wf[loadAudioId] = {
    class_type: "LoadAudio",
    inputs: { audio: p.refAudioFileName },
  };

  const cloneId = String(n++);
  const cloneInputs: Record<string, any> = {
    omnivoice_model: [loaderId, 0],
    ref_audio: [loadAudioId, 0],
    text: p.text,
    language: p.language,
    num_step: p.numStep,
    guidance_scale: p.guidanceScale,
    denoise: p.denoise,
    preprocess_prompt: p.preprocessPrompt,
    postprocess_output: p.postprocessOutput,
    speed: p.speed,
    duration: p.duration,
    seed: p.seed,
  };
  if (p.refText && p.refText.trim()) cloneInputs.ref_text = p.refText.trim();
  if (p.instruct && p.instruct.trim()) cloneInputs.instruct = p.instruct.trim();
  wf[cloneId] = { class_type: "OmniVoiceClone", inputs: cloneInputs };

  const saveId = String(n++);
  wf[saveId] = {
    class_type: "SaveAudio",
    inputs: {
      audio: [cloneId, 0],
      filename_prefix: `audio/FS_OMNI_CLONE_${Date.now()}`,
    },
  };

  return wf;
}
