import { useState } from "react";

const VOICE_GROUPS: { label: string; values: string[] }[] = [
  { label: "Gender", values: ["female", "male"] },
  { label: "Age", values: ["child", "teenager", "young adult", "middle-aged", "elderly"] },
  { label: "Pitch", values: ["very low pitch", "low pitch", "moderate pitch", "high pitch", "very high pitch"] },
  { label: "Style", values: ["whisper"] },
  { label: "Accent", values: [
    "american accent", "australian accent", "british accent", "canadian accent",
    "chinese accent", "indian accent", "japanese accent", "korean accent",
    "portuguese accent", "russian accent",
  ] },
];

const MARKERS: { tag: string; label: string }[] = [
  { tag: "[laughter]", label: "laughter" },
  { tag: "[sigh]", label: "sigh" },
  { tag: "[confirmation-en]", label: "confirm-en" },
  { tag: "[question-en]", label: "?-en" },
  { tag: "[question-ah]", label: "?-ah" },
  { tag: "[question-oh]", label: "?-oh" },
  { tag: "[question-ei]", label: "?-ei" },
  { tag: "[question-yi]", label: "?-yi" },
  { tag: "[surprise-ah]", label: "surprise-ah" },
  { tag: "[surprise-oh]", label: "surprise-oh" },
  { tag: "[surprise-wa]", label: "surprise-wa" },
  { tag: "[surprise-yo]", label: "surprise-yo" },
  { tag: "[dissatisfaction-hnn]", label: "hnn" },
];

function parseInstruct(value: string): Set<string> {
  return new Set(value.split(",").map((s) => s.trim()).filter(Boolean));
}

function joinInstruct(set: Set<string>): string {
  return Array.from(set).join(", ");
}

export function VoiceDesignChips({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const active = parseInstruct(value);
  const toggleInGroup = (groupValues: string[], clicked: string) => {
    const next = new Set(active);
    const wasActive = next.has(clicked);
    // Single-select per group: remove every value from this group, then re-add only if click is "activate"
    for (const v of groupValues) next.delete(v);
    if (!wasActive) next.add(clicked);
    onChange(joinInstruct(next));
  };
  return (
    <div className="omni-chips">
      {VOICE_GROUPS.map((group) => (
        <div className="omni-chip-group" key={group.label}>
          <div className="omni-chip-group-label">{group.label}</div>
          <div className="omni-chip-row">
            {group.values.map((v) => (
              <button
                key={v}
                type="button"
                className={`omni-chip ${active.has(v) ? "active" : ""}`}
                onClick={(e) => { e.stopPropagation(); toggleInGroup(group.values, v); }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function NonVerbalMarkerChips() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (tag: string) => {
    try { await navigator.clipboard.writeText(tag); } catch { /* ignore */ }
    setCopied(tag);
    setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1200);
  };
  return (
    <div className="omni-chips">
      <div className="omni-chip-row">
        {MARKERS.map((m) => (
          <button
            key={m.tag}
            type="button"
            className={`omni-chip ${copied === m.tag ? "copied" : ""}`}
            onClick={(e) => { e.stopPropagation(); copy(m.tag); }}
            title={`Copy ${m.tag}`}
          >
            {copied === m.tag ? "✓ copied" : m.label}
          </button>
        ))}
      </div>
      <p className="settings-hint" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.4 }}>
        Click to copy. Paste into the connected Prompt node's text — e.g. <code>[laughter] You really got me.</code>
      </p>
    </div>
  );
}
