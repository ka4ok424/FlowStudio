import { useWorkflowStore } from "../../store/workflowStore";
import { JOY_EXTRAS_KEYS } from "../../workflows/describe";

const FLORENCE_MODELS = [
  "microsoft/Florence-2-base",
  "microsoft/Florence-2-base-ft",
  "microsoft/Florence-2-large",
  "microsoft/Florence-2-large-ft",
  "thwri/CogFlorence-2.2-Large",
  "MiaoshouAI/Florence-2-base-PromptGen-v2.0",
];

const FLORENCE_TASKS = [
  { value: "caption", label: "Caption (1 sentence)" },
  { value: "detailed_caption", label: "Detailed Caption (2-3 sent.)" },
  { value: "more_detailed_caption", label: "More Detailed (paragraph)" },
  { value: "prompt_gen_tags", label: "Prompt Tags" },
  { value: "dense_region_caption", label: "Dense Region Caption" },
  { value: "region_caption", label: "Region Caption" },
  { value: "region_proposal", label: "Region Proposal" },
  { value: "ocr", label: "OCR (extract text)" },
  { value: "ocr_with_region", label: "OCR with regions" },
  { value: "caption_to_phrase_grounding", label: "Phrase Grounding (needs text)" },
  { value: "referring_expression_segmentation", label: "Referring Expression (needs text)" },
];

const JOY_MODELS = [
  "unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit",
  "unsloth/Meta-Llama-3.1-8B-Instruct",
  "John6666/Llama-3.1-8B-Lexi-Uncensored-V2-nf4",
  "Orenguteng/Llama-3.1-8B-Lexi-Uncensored-V2",
];

const JOY_CAPTION_TYPES = [
  "Descriptive",
  "Descriptive (Informal)",
  "Training Prompt",
  "MidJourney",
  "Booru tag list",
  "Booru-like tag list",
  "Art Critic",
  "Product Listing",
  "Social Media Post",
];

const JOY_LENGTH_PRESETS = [
  "any", "very short", "short", "medium-length", "long", "very long",
];
const JOY_LENGTH_WORDS = ["20", "30", "40", "50", "60", "70", "80", "90", "100", "120", "150", "180", "200", "250", "300"];

// Short human-readable labels for extra-option flags (see JOY_EXTRAS_KEYS for full text sent to ComfyUI).
const EXTRA_LABELS: Record<keyof typeof JOY_EXTRAS_KEYS, string> = {
  usePersonName: "Refer to people by name below",
  noImmutableTraits: "Skip immutable traits (ethnicity, gender)",
  lighting: "Include lighting",
  cameraAngle: "Include camera angle",
  watermark: "Include watermark info",
  jpegArtifacts: "Include JPEG artifacts info",
  cameraDetails: "Include camera details (aperture/ISO/…)",
  noSexual: "Keep PG (no sexual)",
  noResolution: "Do not mention resolution",
  aestheticQuality: "Include aesthetic quality",
  composition: "Include composition style",
  noText: "Do not mention in-image text",
  depthOfField: "Include depth of field",
  lightingSources: "Include lighting sources",
  noAmbiguous: "No ambiguous language",
  sfwNsfw: "Include SFW/NSFW tag",
  importantOnly: "Only most important elements",
};

function DescribeProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const update = useWorkflowStore((s) => s.updateWidgetValue);
  const wv = data.widgetValues || {};
  const model: "florence2" | "joycaption" = wv.model || "florence2";
  const v = <T,>(key: string, dflt: T): T => (wv[key] !== undefined ? wv[key] : dflt);

  return (
    <>
      {/* ── Model switch ────────────────────────────────────────── */}
      <div className="props-section">
        <div className="props-section-title">Model</div>
        <select className="props-select" value={model}
          onChange={(e) => update(nodeId, "model", e.target.value)}>
          <option value="florence2">Florence-2 (fast, small)</option>
          <option value="joycaption">JoyCaption Alpha Two (rich)</option>
        </select>
      </div>

      {/* ── Florence-2 branch ───────────────────────────────────── */}
      {model === "florence2" && (
        <>
          <div className="props-section">
            <div className="props-section-title">Florence-2 Model</div>
            <select className="props-select"
              value={v("florenceModel", "microsoft/Florence-2-base")}
              onChange={(e) => update(nodeId, "florenceModel", e.target.value)}>
              {FLORENCE_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="props-section">
            <div className="props-section-title">Task</div>
            <select className="props-select"
              value={v("task", "detailed_caption")}
              onChange={(e) => update(nodeId, "task", e.target.value)}>
              {FLORENCE_TASKS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {(v("task", "detailed_caption") === "caption_to_phrase_grounding" ||
            v("task", "detailed_caption") === "referring_expression_segmentation") && (
            <div className="props-section">
              <div className="props-section-title">Text Input</div>
              <input className="props-input" type="text"
                value={v("textInput", "")}
                placeholder="e.g. 'the red car'"
                onChange={(e) => update(nodeId, "textInput", e.target.value)} />
            </div>
          )}
          <details className="props-section props-temp-section">
            <summary className="props-temp-header">Advanced <span className="props-temp-badge">PRO</span></summary>
            <div className="props-section">
              <div className="props-section-title">Max New Tokens</div>
              <input type="range" className="props-range" min={64} max={2048} step={32}
                value={v("maxNewTokens", 1024)}
                onChange={(e) => update(nodeId, "maxNewTokens", parseInt(e.target.value))} />
              <span className="props-range-value">{v("maxNewTokens", 1024)}</span>
            </div>
            <div className="props-section">
              <div className="props-section-title">Num Beams</div>
              <input type="range" className="props-range" min={1} max={5} step={1}
                value={v("numBeams", 3)}
                onChange={(e) => update(nodeId, "numBeams", parseInt(e.target.value))} />
              <span className="props-range-value">{v("numBeams", 3)}</span>
            </div>
            <div className="props-section">
              <label className="props-check-row">
                <input type="checkbox"
                  checked={!!v("doSample", false)}
                  onChange={(e) => update(nodeId, "doSample", e.target.checked)} />
                <span>Do Sample (stochastic)</span>
              </label>
            </div>
            <div className="props-section">
              <div className="props-section-title">Precision</div>
              <select className="props-select"
                value={v("precision", "fp16")}
                onChange={(e) => update(nodeId, "precision", e.target.value)}>
                <option value="fp16">fp16</option>
                <option value="bf16">bf16</option>
                <option value="fp32">fp32</option>
              </select>
            </div>
          </details>
        </>
      )}

      {/* ── JoyCaption branch ──────────────────────────────────── */}
      {model === "joycaption" && (
        <>
          <div className="props-section">
            <div className="props-section-title">JoyCaption Base Model</div>
            <select className="props-select"
              value={v("joyModel", "unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit")}
              onChange={(e) => update(nodeId, "joyModel", e.target.value)}>
              {JOY_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="props-section">
            <div className="props-section-title">Caption Type</div>
            <select className="props-select"
              value={v("captionType", "Descriptive")}
              onChange={(e) => update(nodeId, "captionType", e.target.value)}>
              {JOY_CAPTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="props-section">
            <div className="props-section-title">Caption Length</div>
            <select className="props-select"
              value={v("captionLength", "medium-length")}
              onChange={(e) => update(nodeId, "captionLength", e.target.value)}>
              <optgroup label="Presets">
                {JOY_LENGTH_PRESETS.map((l) => <option key={l} value={l}>{l}</option>)}
              </optgroup>
              <optgroup label="Word count">
                {JOY_LENGTH_WORDS.map((l) => <option key={l} value={l}>{l} words</option>)}
              </optgroup>
            </select>
          </div>
          <div className="props-section">
            <div className="props-section-title">Person Name (optional)</div>
            <input className="props-input" type="text"
              value={v("personName", "")}
              placeholder="Used only if 'Refer by name' extra is on"
              onChange={(e) => update(nodeId, "personName", e.target.value)} />
          </div>
          <div className="props-section">
            <div className="props-section-title">Custom Prompt (optional)</div>
            <textarea className="props-input" rows={3}
              value={v("customPrompt", "")}
              placeholder="Overrides built-in type/length templates if provided"
              onChange={(e) => update(nodeId, "customPrompt", e.target.value)} />
          </div>

          <details className="props-section props-temp-section">
            <summary className="props-temp-header">Extras (behaviour flags) <span className="props-temp-badge">PRO</span></summary>
            {(Object.keys(JOY_EXTRAS_KEYS) as (keyof typeof JOY_EXTRAS_KEYS)[]).map((k) => (
              <label key={k} className="props-check-row" style={{ display: "flex", gap: 8, padding: "4px 0" }}>
                <input type="checkbox"
                  checked={!!v(`extra_${k}`, false)}
                  onChange={(e) => update(nodeId, `extra_${k}`, e.target.checked)} />
                <span style={{ fontSize: 12 }}>{EXTRA_LABELS[k]}</span>
              </label>
            ))}
          </details>

          <details className="props-section props-temp-section">
            <summary className="props-temp-header">Sampling <span className="props-temp-badge">PRO</span></summary>
            <div className="props-section">
              <div className="props-section-title">Temperature</div>
              <input type="range" className="props-range" min={0} max={1.5} step={0.05}
                value={v("temperature", 0.6)}
                onChange={(e) => update(nodeId, "temperature", parseFloat(e.target.value))} />
              <span className="props-range-value">{(v("temperature", 0.6) as number).toFixed(2)}</span>
            </div>
            <div className="props-section">
              <div className="props-section-title">Top P</div>
              <input type="range" className="props-range" min={0} max={1} step={0.05}
                value={v("topP", 0.9)}
                onChange={(e) => update(nodeId, "topP", parseFloat(e.target.value))} />
              <span className="props-range-value">{(v("topP", 0.9) as number).toFixed(2)}</span>
            </div>
            <div className="props-section">
              <label className="props-check-row">
                <input type="checkbox"
                  checked={!!v("lowVram", false)}
                  onChange={(e) => update(nodeId, "lowVram", e.target.checked)} />
                <span>Low VRAM mode</span>
              </label>
            </div>
          </details>
        </>
      )}

      {/* ── Shared ─────────────────────────────────────────────── */}
      <div className="props-section">
        <div className="props-section-title">Seed</div>
        <div className="props-input-row">
          <input type="number" className="props-input" value={v("seed", "") as any} placeholder="Random"
            onChange={(e) => update(nodeId, "seed", e.target.value)} />
          <button className="props-dice-btn"
            onClick={() => update(nodeId, "seed", Math.floor(Math.random() * 2147483647).toString())}>🎲</button>
        </div>
      </div>
      <div className="props-section">
        <label className="props-check-row">
          <input type="checkbox"
            checked={v("keepLoaded", true) as any}
            onChange={(e) => update(nodeId, "keepLoaded", e.target.checked)} />
          <span>Keep model loaded in VRAM</span>
        </label>
      </div>
    </>
  );
}

export default DescribeProperties;
