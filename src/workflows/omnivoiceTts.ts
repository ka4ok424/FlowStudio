export interface OmniVoiceTtsParams {
  text: string;
  language: string;        // "Auto" or specific language code
  numStep: number;
  guidanceScale: number;
  denoise: boolean;
  preprocessPrompt: boolean;
  postprocessOutput: boolean;
  speed: number;
  duration: number;        // 0 = auto
  seed: number;
  instruct: string;        // empty string = no instruct
  modelPath: string;       // "omnivoice" → ComfyUI/models/omnivoice
  precision: "fp16" | "bf16" | "fp32";
  loadAsr: boolean;
}

/**
 * Build ComfyUI workflow for OmniVoice text-to-speech (no voice cloning).
 *
 *   OmniVoiceModelLoader → OMNIVOICE_MODEL ──┐
 *                                            ↓
 *   OmniVoiceTTS(text, language, num_step, guidance_scale, denoise,
 *                preprocess_prompt, postprocess_output, speed, duration,
 *                seed, instruct?) → AUDIO
 *                                            ↓
 *                                   SaveAudio(audio/FS_OMNI_TTS_<ts>)
 *
 * Models live in ComfyUI/models/omnivoice/ (HF k2-fsa/OmniVoice mirror):
 *   - model.safetensors                 (~2.45 GB main TTS model)
 *   - audio_tokenizer/model.safetensors (~806 MB audio tokenizer)
 *   - tokenizer.json, config.json, chat_template.jinja
 */
export function buildOmniVoiceTtsWorkflow(p: OmniVoiceTtsParams): Record<string, any> {
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

  const ttsId = String(n++);
  const ttsInputs: Record<string, any> = {
    omnivoice_model: [loaderId, 0],
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
  if (p.instruct && p.instruct.trim()) ttsInputs.instruct = p.instruct.trim();
  wf[ttsId] = { class_type: "OmniVoiceTTS", inputs: ttsInputs };

  const saveId = String(n++);
  wf[saveId] = {
    class_type: "SaveAudio",
    inputs: {
      audio: [ttsId, 0],
      filename_prefix: `audio/FS_OMNI_TTS_${Date.now()}`,
    },
  };

  return wf;
}
