import { useWorkflowStore } from "../../store/workflowStore";
import { VoiceDesignChips, NonVerbalMarkerChips } from "./OmniVoiceChips";

const LANGUAGES = [
  "Auto", "en", "zh", "ja", "ko", "ru", "fr", "de", "es", "it",
  "pt", "ar", "hi", "tr", "vi", "th", "id", "pl", "nl", "sv",
];

function OmniVoiceTtsProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);

  const language = data.widgetValues?.language || "Auto";
  const numStep = data.widgetValues?.numStep ?? 32;
  const guidanceScale = data.widgetValues?.guidanceScale ?? 2.0;
  const denoise = data.widgetValues?.denoise ?? true;
  const preprocessPrompt = data.widgetValues?.preprocessPrompt ?? true;
  const postprocessOutput = data.widgetValues?.postprocessOutput ?? true;
  const speed = data.widgetValues?.speed ?? 1.0;
  const duration = data.widgetValues?.duration ?? 0;
  const seed = data.widgetValues?.seed ?? "";
  const instruct = data.widgetValues?.instruct ?? "";
  const modelPath = data.widgetValues?.modelPath ?? "omnivoice";
  const precision = data.widgetValues?.precision ?? "fp16";
  const loadAsr = data.widgetValues?.loadAsr ?? true;

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Language</div>
        <select className="props-select" value={language}
          onChange={(e) => updateWidgetValue(nodeId, "language", e.target.value)}>
          {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      <div className="props-section">
        <div className="props-section-title">Voice Design (instruct)</div>
        <VoiceDesignChips value={instruct} onChange={(v) => updateWidgetValue(nodeId, "instruct", v)} />
        <textarea className="props-textarea" value={instruct} rows={2}
          placeholder="Click chips above OR type comma-separated"
          onChange={(e) => updateWidgetValue(nodeId, "instruct", e.target.value)}
          style={{ marginTop: 8 }} />
      </div>

      <div className="props-section">
        <div className="props-section-title">Non-verbal markers (paste into Prompt text)</div>
        <NonVerbalMarkerChips />
      </div>

      <div className="props-section">
        <div className="props-section-title">Diffusion Steps</div>
        <input type="range" className="props-range" min={4} max={64} step={1} value={numStep}
          onChange={(e) => updateWidgetValue(nodeId, "numStep", parseInt(e.target.value))} />
        <span className="props-range-value">{numStep}</span>
      </div>

      <div className="props-section">
        <div className="props-section-title">Guidance Scale (CFG)</div>
        <input type="range" className="props-range" min={0} max={4} step={0.1} value={guidanceScale}
          onChange={(e) => updateWidgetValue(nodeId, "guidanceScale", parseFloat(e.target.value))} />
        <span className="props-range-value">{guidanceScale.toFixed(1)}</span>
      </div>

      <div className="props-section">
        <div className="props-section-title">Speed</div>
        <input type="range" className="props-range" min={0.5} max={2.0} step={0.05} value={speed}
          onChange={(e) => updateWidgetValue(nodeId, "speed", parseFloat(e.target.value))} />
        <span className="props-range-value">{speed.toFixed(2)}×</span>
      </div>

      <div className="props-section">
        <div className="props-section-title">Duration (seconds)</div>
        <input type="range" className="props-range" min={0} max={60} step={0.5} value={duration}
          onChange={(e) => updateWidgetValue(nodeId, "duration", parseFloat(e.target.value))} />
        <span className="props-range-value">{duration === 0 ? "auto" : `${duration}s`}</span>
      </div>

      <div className="props-section">
        <div className="props-section-title">Seed</div>
        <div className="props-input-row">
          <input type="number" className="props-input" value={seed} placeholder="Random"
            onChange={(e) => updateWidgetValue(nodeId, "seed", e.target.value)} />
          <button className="props-dice-btn"
            onClick={() => updateWidgetValue(nodeId, "seed", Math.floor(Math.random() * 2147483647).toString())}>🎲</button>
        </div>
      </div>

      <details className="props-section props-temp-section">
        <summary className="props-temp-header">Advanced <span className="props-temp-badge">PRO</span></summary>

        <div className="props-section">
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer" }}>
            <input type="checkbox" checked={denoise}
              onChange={(e) => updateWidgetValue(nodeId, "denoise", e.target.checked)} />
            <span>Denoise <span style={{ color: "var(--text-muted)", fontSize: 11 }}>(default ON)</span></span>
          </label>
        </div>

        <div className="props-section">
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer" }}>
            <input type="checkbox" checked={preprocessPrompt}
              onChange={(e) => updateWidgetValue(nodeId, "preprocessPrompt", e.target.checked)} />
            <span>Preprocess Prompt <span style={{ color: "var(--text-muted)", fontSize: 11 }}>(text normalization)</span></span>
          </label>
        </div>

        <div className="props-section">
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer" }}>
            <input type="checkbox" checked={postprocessOutput}
              onChange={(e) => updateWidgetValue(nodeId, "postprocessOutput", e.target.checked)} />
            <span>Postprocess Output <span style={{ color: "var(--text-muted)", fontSize: 11 }}>(audio cleanup)</span></span>
          </label>
        </div>

        <div className="props-section">
          <div className="props-section-title">Model Path</div>
          <input type="text" className="props-input" value={modelPath}
            onChange={(e) => updateWidgetValue(nodeId, "modelPath", e.target.value)} />
          <p className="settings-hint" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4 }}>
            Default "omnivoice" → ComfyUI/models/omnivoice/. Or absolute path.
          </p>
        </div>

        <div className="props-section">
          <div className="props-section-title">Precision</div>
          <select className="props-select" value={precision}
            onChange={(e) => updateWidgetValue(nodeId, "precision", e.target.value)}>
            <option value="fp16">fp16 (default, ~3.3 GB VRAM)</option>
            <option value="bf16">bf16</option>
            <option value="fp32">fp32 (best quality, ~6.6 GB VRAM)</option>
          </select>
        </div>

        <div className="props-section">
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer" }}>
            <input type="checkbox" checked={loadAsr}
              onChange={(e) => updateWidgetValue(nodeId, "loadAsr", e.target.checked)} />
            <span>Load ASR (Whisper) <span style={{ color: "var(--text-muted)", fontSize: 11 }}>(needed only for Clone auto-transcribe)</span></span>
          </label>
        </div>

        <div className="props-section">
          <ul className="settings-hint" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 0, lineHeight: 1.5, paddingLeft: 16 }}>
            <li><b>Language</b> — OmniVoice supports 600+ codes. "Auto" detects from text.</li>
            <li><b>Voice Design</b> — click chips OR type comma-separated. Only listed values are valid.</li>
            <li><b>Diffusion Steps</b> — 32 default; 16 faster; higher = cleaner but slower.</li>
            <li><b>Guidance (CFG)</b> — 2.0 default; higher = stricter prompt match.</li>
            <li><b>Duration</b> — 0 = auto (length from text). Setting overrides speed.</li>
            <li><b>Seed</b> — fix to a number to reproduce the same voice; empty = random per run.</li>
            <li><b>Tail clipping?</b> Try Speed=0.9, set Duration manually, or disable Postprocess Output. Model is actively updated — <a href="https://github.com/k2-fsa/OmniVoice" target="_blank" rel="noopener noreferrer" style={{ color: "#f472b6" }}>check GitHub</a> for fixes.</li>
          </ul>
        </div>
      </details>
    </>
  );
}

export default OmniVoiceTtsProperties;
