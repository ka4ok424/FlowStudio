import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { getCustomRules, setCustomRules } from "../ai/rules";
import { getComfyUrl, setComfyUrl } from "../api/comfyApi";
import ModelLibrary from "./ModelLibrary";

interface ApiKeys {
  google: string;
  openai: string;
  claude: string;
  elevenlabs: string;
  kling: string;
  tiktok_client_key: string;
  tiktok_client_secret: string;
}

const STORAGE_KEY = "flowstudio_api_keys";

export function getApiKeys(): ApiKeys {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch { return { google: "", openai: "", claude: "", elevenlabs: "", kling: "" }; }
}

export function getApiKey(provider: string): string {
  return (getApiKeys() as any)[provider] || "";
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: Props) {
  const [aiRules, setAiRules] = useState("");
  const [keys, setKeys] = useState<ApiKeys>({ google: "", openai: "", claude: "", elevenlabs: "", kling: "", tiktok_client_key: "", tiktok_client_secret: "" });
  const [comfyServer, setComfyServer] = useState("");
  const [modelsOpen, setModelsOpen] = useState(false);

  useEffect(() => {
    if (open) {
      const saved = getApiKeys();
      setKeys({ google: saved.google || "", openai: saved.openai || "", claude: saved.claude || "", elevenlabs: saved.elevenlabs || "", kling: saved.kling || "", tiktok_client_key: saved.tiktok_client_key || "", tiktok_client_secret: saved.tiktok_client_secret || "" });
      setAiRules(getCustomRules());
      setComfyServer(getComfyUrl());
    }
  }, [open]);

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
    setCustomRules(aiRules);
    setComfyUrl(comfyServer);
    onClose();
  };

  const comfyPresets = [
    { label: "Local (Vite Proxy)", value: "" },
    { label: "Windows PC (RTX 5090)", value: "http://192.168.31.175:8188" },
  ];

  if (!open) return null;

  const fields: { key: keyof ApiKeys; label: string; hint: string }[] = [
    { key: "google", label: "Google AI (Gemini)", hint: "Nano Banana, Gemini Text, Veo" },
    { key: "openai", label: "OpenAI", hint: "GPT Image, ChatGPT" },
    { key: "claude", label: "Claude (Anthropic)", hint: "AI Chat assistant" },
    { key: "elevenlabs", label: "ElevenLabs", hint: "Text-to-Speech" },
    { key: "kling", label: "Kling", hint: "Video generation" },
    { key: "tiktok_client_key", label: "TikTok Client Key", hint: "Content Posting API" },
    { key: "tiktok_client_secret", label: "TikTok Client Secret", hint: "Content Posting API" },
  ];

  return (
    <>
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Settings</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="settings-section-title">ComfyUI Server</div>
          <p className="settings-hint">Select which ComfyUI backend to use for local generation.</p>
          <div className="settings-field">
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {comfyPresets.map((p) => (
                <button
                  key={p.value}
                  className={`settings-preset-btn ${comfyServer === p.value ? "active" : ""}`}
                  onClick={() => setComfyServer(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              className="settings-input"
              value={comfyServer}
              onChange={(e) => setComfyServer(e.target.value)}
              placeholder="http://127.0.0.1:8188 or empty for proxy"
            />
          </div>

          <div className="settings-section-title" style={{ marginTop: 16 }}>API Keys</div>
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

          <div className="settings-section-title" style={{ marginTop: 16 }}>Models Library</div>
          <p className="settings-hint">Browse all models installed on the ComfyUI backend, grouped by category.</p>
          <button
            className="settings-preset-btn"
            style={{ marginTop: 4 }}
            onClick={() => setModelsOpen(true)}
          >
            📚 Browse Models Library
          </button>

          <div className="settings-section-title" style={{ marginTop: 16 }}>AI Assistant Rules</div>
          <p className="settings-hint">Custom instructions for the AI assistant. These are added to every conversation.</p>
          <textarea
            className="settings-textarea"
            value={aiRules}
            onChange={(e) => setAiRules(e.target.value)}
            placeholder="Example: Always create groups when adding 3+ nodes. Use green for main story, blue for assets. Speak only Russian."
            rows={5}
          />
        </div>

        <div className="modal-footer">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-save" onClick={save}>Save</button>
        </div>
      </div>
    </div>
    {modelsOpen && createPortal(
      <div className="modal-backdrop" onClick={() => setModelsOpen(false)} style={{ zIndex: 10000 }}>
        <div
          className="modal-content"
          onClick={(e) => e.stopPropagation()}
          style={{ width: 720, maxWidth: "90vw", height: "80vh", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}
        >
          <div className="modal-header" style={{ flexShrink: 0 }}>
            <span className="modal-title">Models Library</span>
            <button className="modal-close" onClick={() => setModelsOpen(false)}>✕</button>
          </div>
          <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
            <ModelLibrary />
          </div>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}
