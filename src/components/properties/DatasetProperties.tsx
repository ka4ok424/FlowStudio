import { useWorkflowStore } from "../../store/workflowStore";

const FLORENCE_TASKS = [
  { value: "caption", label: "Caption (1 sentence)" },
  { value: "detailed_caption", label: "Detailed Caption" },
  { value: "more_detailed_caption", label: "More Detailed (paragraph)" },
  { value: "prompt_gen_tags", label: "Prompt Tags" },
];
const JOY_TYPES = [
  "Descriptive", "Descriptive (Informal)", "Training Prompt",
  "MidJourney", "Booru tag list", "Booru-like tag list",
  "Art Critic", "Product Listing", "Social Media Post",
];
const JOY_LENGTHS = ["any", "very short", "short", "medium-length", "long", "very long"];

function DatasetProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const update = useWorkflowStore((s) => s.updateWidgetValue);
  const wv = data.widgetValues || {};
  const v = <T,>(k: string, d: T): T => (wv[k] !== undefined ? wv[k] : d);
  const model = v("model", "joycaption");

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Filename Prefix</div>
        <input className="props-input" type="text"
          value={v("prefix", "dataset")}
          placeholder="e.g. asmr_dirt"
          onChange={(e) => update(nodeId, "prefix", e.target.value.replace(/[^a-zA-Z0-9_-]/g, "_"))} />
      </div>

      <div className="props-section">
        <div className="props-section-title">Auto-caption Model</div>
        <select className="props-select" value={model}
          onChange={(e) => update(nodeId, "model", e.target.value)}>
          <option value="joycaption">JoyCaption Alpha Two (rich)</option>
          <option value="florence2">Florence-2 (fast)</option>
        </select>
      </div>

      {model === "florence2" && (
        <div className="props-section">
          <div className="props-section-title">Florence-2 Task</div>
          <select className="props-select" value={v("florenceTask", "detailed_caption")}
            onChange={(e) => update(nodeId, "florenceTask", e.target.value)}>
            {FLORENCE_TASKS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      )}

      {model === "joycaption" && (
        <>
          <div className="props-section">
            <div className="props-section-title">JoyCaption Type</div>
            <select className="props-select" value={v("captionType", "Descriptive")}
              onChange={(e) => update(nodeId, "captionType", e.target.value)}>
              {JOY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="props-section">
            <div className="props-section-title">JoyCaption Length</div>
            <select className="props-select" value={v("captionLength", "medium-length")}
              onChange={(e) => update(nodeId, "captionLength", e.target.value)}>
              {JOY_LENGTHS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </>
      )}

      <p className="settings-hint" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
        Each connected image becomes <code>{v("prefix", "dataset")}_001.png</code> + <code>.txt</code>.
        Captions from connected TXT inputs are kept as-is; missing ones are auto-generated. ZIP is ready for kohya-ss / ai-toolkit.
      </p>
    </>
  );
}

export default DatasetProperties;
