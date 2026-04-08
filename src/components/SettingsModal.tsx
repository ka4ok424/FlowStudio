import { useState, useEffect } from "react";

interface ApiKeys {
  google: string;
  openai: string;
  elevenlabs: string;
  kling: string;
}

const STORAGE_KEY = "flowstudio_api_keys";

export function getApiKeys(): ApiKeys {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch { return { google: "", openai: "", elevenlabs: "", kling: "" }; }
}

export function getApiKey(provider: string): string {
  return (getApiKeys() as any)[provider] || "";
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: Props) {
  const [keys, setKeys] = useState<ApiKeys>({ google: "", openai: "", elevenlabs: "", kling: "" });

  useEffect(() => {
    if (open) {
      const saved = getApiKeys();
      setKeys({ google: saved.google || "", openai: saved.openai || "", elevenlabs: saved.elevenlabs || "", kling: saved.kling || "" });
    }
  }, [open]);

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
    onClose();
  };

  if (!open) return null;

  const fields: { key: keyof ApiKeys; label: string; hint: string }[] = [
    { key: "google", label: "Google AI (Gemini)", hint: "Nano Banana, Gemini Text, Veo" },
    { key: "openai", label: "OpenAI", hint: "GPT Image, ChatGPT" },
    { key: "elevenlabs", label: "ElevenLabs", hint: "Text-to-Speech" },
    { key: "kling", label: "Kling", hint: "Video generation" },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Settings</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="settings-section-title">API Keys</div>
          <p className="settings-hint">Keys are stored locally and never included in workflow exports.</p>

          {fields.map(({ key, label, hint }) => (
            <div key={key} className="settings-field">
              <label className="settings-label">
                {label}
                <span className="settings-label-hint">{hint}</span>
              </label>
              <input
                type="password"
                className="settings-input"
                value={keys[key]}
                onChange={(e) => setKeys({ ...keys, [key]: e.target.value })}
                placeholder="Enter API key..."
              />
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-save" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
