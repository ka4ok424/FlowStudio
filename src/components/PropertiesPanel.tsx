import { useRef } from "react";
import { useWorkflowStore } from "../store/workflowStore";

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function PropertiesPanel() {
  const { nodes, selectedNodeId } = useWorkflowStore();
  const node = nodes.find((n) => n.id === selectedNodeId);

  if (!node) return null;

  const data = node.data as any;
  const isNative = data._native;

  return (
    <div className="properties-panel">
      <div className="props-header">
        <span className="props-dot" />
        <span className="props-title">{data.label}</span>
        <span className="props-type-badge">{data.type?.replace("fs:", "")}</span>
      </div>

      <div className="props-content">
        {/* Import node properties */}
        {data.type === "fs:import" && <ImportProperties nodeId={node.id} data={data} />}

        {/* Local Generate properties */}
        {data.type === "fs:localGenerate" && <LocalGenProperties nodeId={node.id} data={data} />}

        {/* Nano Banana properties */}
        {data.type === "fs:nanoBanana" && <NanoBananaProperties nodeId={node.id} data={data} />}

        {/* Group properties */}
        {data.type === "fs:group" && <GroupProperties nodeId={node.id} data={data} />}

        {/* Comment properties */}
        {data.type === "fs:comment" && <CommentProperties nodeId={node.id} data={data} />}

        {/* Video Gen properties */}
        {data.type === "fs:videoGen" && <VideoGenProperties nodeId={node.id} data={data} />}

        {/* Imagen properties */}
        {data.type === "fs:imagen" && <ImagenProperties nodeId={node.id} data={data} />}

        {/* Music properties */}
        {data.type === "fs:music" && <MusicProperties nodeId={node.id} data={data} />}

        {/* TTS properties */}
        {data.type === "fs:tts" && <TtsProperties nodeId={node.id} data={data} />}

        {/* Multi Reference properties */}
        {data.type === "fs:multiRef" && <MultiRefProperties nodeId={node.id} data={data} />}

        {/* Scene properties */}
        {data.type === "fs:scene" && <SceneProperties nodeId={node.id} data={data} />}

        {/* Storyboard properties */}
        {data.type === "fs:storyboard" && <StoryboardProperties nodeId={node.id} data={data} />}

        {/* Character Card properties */}
        {data.type === "fs:characterCard" && <CharacterCardProperties nodeId={node.id} data={data} />}

        {/* Prompt node properties */}
        {data.type === "fs:prompt" && <PromptProperties data={data} />}

        {/* ComfyUI node properties */}
        {!isNative && <ComfyProperties data={data} />}
      </div>
    </div>
  );
}

// ── Import Properties ──────────────────────────────────────────────
function ImportProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const mediaType = data.widgetValues?._mediaType || "none";
  const fileName = data.widgetValues?._fileName || "";
  const fileInfo = data.widgetValues?._fileInfo || {};
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearFile = () => {
    const prev = data.widgetValues?._preview;
    if (prev) URL.revokeObjectURL(prev);
    updateWidgetValue(nodeId, "_mediaType", "none");
    updateWidgetValue(nodeId, "_fileName", "");
    updateWidgetValue(nodeId, "_preview", null);
    updateWidgetValue(nodeId, "_fileInfo", {});
  };

  const replaceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const mime = file.type;
    let type = "none";
    if (mime.startsWith("image/")) type = "image";
    else if (mime.startsWith("video/")) type = "video";
    else if (mime.startsWith("audio/")) type = "audio";

    const url = URL.createObjectURL(file);
    const ext = file.name.split(".").pop()?.toUpperCase() || "";
    updateWidgetValue(nodeId, "_mediaType", type);
    updateWidgetValue(nodeId, "_fileName", file.name);
    updateWidgetValue(nodeId, "_preview", url);
    updateWidgetValue(nodeId, "_fileInfo", { size: formatSize(file.size), format: ext });
  };

  const TYPE_BADGE_COLORS: Record<string, string> = {
    image: "#4ecdc4",
    video: "#ab47bc",
    audio: "#e8a040",
    none: "#888",
  };

  const preview = data.widgetValues?._preview;
  const badgeColor = TYPE_BADGE_COLORS[mediaType];

  if (mediaType === "none") {
    return <div className="props-empty">No file loaded</div>;
  }

  return (
    <>
      {/* Preview for all media types */}
      {preview && mediaType === "image" && (
        <div className="props-preview">
          <img src={preview} alt="" />
        </div>
      )}
      {preview && mediaType === "video" && (
        <div className="props-preview">
          <video src={preview} controls muted style={{ width: "100%", borderRadius: 8 }} />
        </div>
      )}
      {preview && mediaType === "audio" && (
        <div className="props-preview props-audio-preview">
          <audio src={preview} controls style={{ width: "100%" }} />
        </div>
      )}

      {/* Media Info */}
      <div className="props-info-card">
        <div className="props-info-header">
          <span>MEDIA INFO</span>
          <span
            className="props-media-badge"
            style={{
              background: badgeColor + "18",
              border: `1px solid ${badgeColor}`,
              color: badgeColor,
            }}
          >
            {mediaType.toUpperCase()}
          </span>
        </div>

        <div className="props-info-rows">
          {fileName && (
            <div className="props-info-row">
              <span className="props-info-label">Name</span>
              <span className="props-info-value props-truncate">{fileName}</span>
            </div>
          )}
          {fileInfo.resolution && (
            <div className="props-info-row">
              <span className="props-info-label">Resolution</span>
              <span className="props-info-value">{fileInfo.resolution}</span>
            </div>
          )}
          {fileInfo.duration && (
            <div className="props-info-row">
              <span className="props-info-label">Duration</span>
              <span className="props-info-value">{fileInfo.duration}</span>
            </div>
          )}
          {fileInfo.size && (
            <div className="props-info-row">
              <span className="props-info-label">Size</span>
              <span className="props-info-value">{fileInfo.size}</span>
            </div>
          )}
          {fileInfo.format && (
            <div className="props-info-row">
              <span className="props-info-label">Format</span>
              <span className="props-info-value">{fileInfo.format}</span>
            </div>
          )}
          {fileInfo.bitrate && (
            <div className="props-info-row">
              <span className="props-info-label">Bitrate</span>
              <span className="props-info-value">{fileInfo.bitrate}</span>
            </div>
          )}
        </div>
      </div>

      {/* File actions bar */}
      <div className="props-file-bar">
        <span className="props-file-bar-name">{fileName}</span>
        <div className="props-file-bar-btns">
          <button className="props-file-btn" title="Replace file" onClick={() => fileInputRef.current?.click()}>📂</button>
          <button className="props-file-btn props-file-delete" title="Delete file" onClick={clearFile}>🗑</button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*"
          onChange={replaceFile} style={{ display: "none" }} />
      </div>
    </>
  );
}

// ── Nano Banana Properties ─────────────────────────────────────────
function NanoBananaProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const aspectRatio = data.widgetValues?.aspectRatio || "1:1";
  const seed = data.widgetValues?.seed ?? "";
  const temperature = data.widgetValues?.temperature ?? 1.0;
  const numImages = data.widgetValues?.numImages ?? 1;

  const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"];

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Aspect Ratio</div>
        <div className="props-aspect-row">
          {ASPECT_RATIOS.map((ar) => (
            <button
              key={ar}
              className={`props-aspect-btn ${aspectRatio === ar ? "active" : ""}`}
              onClick={() => updateWidgetValue(nodeId, "aspectRatio", ar)}
            >
              {ar}
            </button>
          ))}
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Seed</div>
        <div className="props-input-row">
          <input
            type="number"
            value={seed}
            onChange={(e) => updateWidgetValue(nodeId, "seed", e.target.value)}
            placeholder="Random"
            className="props-input"
          />
          <button
            className="props-dice-btn"
            onClick={() => updateWidgetValue(nodeId, "seed", Math.floor(Math.random() * 2147483647).toString())}
            title="Random seed"
          >
            🎲
          </button>
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Temperature</div>
        <div className="props-slider-row">
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) => updateWidgetValue(nodeId, "temperature", parseFloat(e.target.value))}
            className="props-slider"
          />
          <span className="props-slider-value">{temperature}</span>
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Number of Images</div>
        <div className="props-input-row">
          <input
            type="number"
            min="1"
            max="4"
            value={numImages}
            onChange={(e) => updateWidgetValue(nodeId, "numImages", parseInt(e.target.value) || 1)}
            className="props-input"
          />
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Model</div>
        <select
          className="props-select"
          value={data.widgetValues?.model || "gemini-2.5-flash-image"}
          onChange={(e) => updateWidgetValue(nodeId, "model", e.target.value)}
        >
          <option value="gemini-2.5-flash-image">gemini-2.5-flash-image</option>
          <option value="gemini-3.1-flash-image-preview">gemini-3.1-flash-image-preview</option>
          <option value="nano-banana-pro-preview">nano-banana-pro-preview</option>
        </select>
      </div>

      {/* TEMP: Safety settings */}
      <details className="props-section props-temp-section">
        <summary className="props-temp-header">Safety Settings <span className="props-temp-badge">TEMP</span></summary>

        {[
          { key: "safety_harassment", label: "Harassment" },
          { key: "safety_hate", label: "Hate Speech" },
          { key: "safety_sexual", label: "Sexually Explicit" },
          { key: "safety_dangerous", label: "Dangerous Content" },
        ].map(({ key, label }) => (
          <div key={key} className="props-safety-row">
            <span className="props-safety-label">{label}</span>
            <select
              className="props-safety-select"
              value={data.widgetValues?.[key] || "BLOCK_MEDIUM_AND_ABOVE"}
              onChange={(e) => updateWidgetValue(nodeId, key, e.target.value)}
            >
              <option value="BLOCK_NONE">Off</option>
              <option value="BLOCK_ONLY_HIGH">Low</option>
              <option value="BLOCK_MEDIUM_AND_ABOVE">Medium</option>
              <option value="BLOCK_LOW_AND_ABOVE">High</option>
            </select>
          </div>
        ))}
      </details>
    </>
  );
}

// ── Local Generate Properties ──────────────────────────────────────
function LocalGenProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const nodeDefs = useWorkflowStore((s) => s.nodeDefs);

  // Get all models from ComfyUI
  const checkpoints: string[] = [];
  for (const loaderName of ["UNETLoader", "UnetLoaderGGUF", "CheckpointLoaderSimple"]) {
    if (nodeDefs[loaderName]) {
      const key = loaderName.includes("UNET") || loaderName.includes("Unet") ? "unet_name" : "ckpt_name";
      const config = nodeDefs[loaderName].input?.required?.[key];
      if (config && Array.isArray(config) && Array.isArray(config[0])) {
        for (const m of config[0]) {
          if (!checkpoints.includes(m)) checkpoints.push(m);
        }
      }
    }
  }

  const model = data.widgetValues?.model || checkpoints[0] || "";
  const steps = data.widgetValues?.steps ?? 4;
  const cfg = data.widgetValues?.cfg ?? 7;
  const width = data.widgetValues?.width ?? 512;
  const height = data.widgetValues?.height ?? 512;
  const seed = data.widgetValues?.seed ?? "";

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Checkpoint</div>
        <select className="props-select"
          value={model}
          onChange={(e) => updateWidgetValue(nodeId, "model", e.target.value)}>
          {checkpoints.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="props-section">
        <div className="props-section-title">Size</div>
        <div className="props-input-row">
          <input type="number" className="props-input" value={width} min={64} max={2048} step={64}
            onChange={(e) => updateWidgetValue(nodeId, "width", e.target.value === "" ? "" : parseInt(e.target.value) || "")}
            onBlur={(e) => { if (!e.target.value) updateWidgetValue(nodeId, "width", 512); }} />
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>×</span>
          <input type="number" className="props-input" value={height} min={64} max={2048} step={64}
            onChange={(e) => updateWidgetValue(nodeId, "height", e.target.value === "" ? "" : parseInt(e.target.value) || "")}
            onBlur={(e) => { if (!e.target.value) updateWidgetValue(nodeId, "height", 512); }} />
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Steps</div>
        <div className="props-slider-row">
          <input type="range" className="props-slider" min={1} max={50} value={steps}
            onChange={(e) => updateWidgetValue(nodeId, "steps", parseInt(e.target.value))} />
          <span className="props-slider-value">{steps}</span>
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">CFG Scale</div>
        <div className="props-slider-row">
          <input type="range" className="props-slider" min={1} max={20} step={0.5} value={cfg}
            onChange={(e) => updateWidgetValue(nodeId, "cfg", parseFloat(e.target.value))} />
          <span className="props-slider-value">{cfg}</span>
        </div>
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
    </>
  );
}

// ── Prompt Properties ──────────────────────────────────────────────
function PromptProperties({ data }: { data: any }) {
  const text = data.widgetValues?.text || "";
  return (
    <div className="props-section">
      <div className="props-info-row">
        <span className="props-info-label">Characters</span>
        <span className="props-info-value">{text.length.toLocaleString()}</span>
      </div>
      <div className="props-info-row">
        <span className="props-info-label">Words</span>
        <span className="props-info-value">{text ? text.trim().split(/\s+/).length : 0}</span>
      </div>
    </div>
  );
}

// ── Group Properties ──────────────────────────────────────────────
function GroupProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const title = data.widgetValues?.title ?? "";
  const color = data.widgetValues?.color || "blue";
  const COLORS = ["red", "blue", "green", "purple", "orange", "cyan"];
  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Title</div>
        <input type="text" className="props-input" value={title}
          onChange={(e) => updateWidgetValue(nodeId, "title", e.target.value)}
          onBlur={(e) => { if (!e.target.value.trim()) updateWidgetValue(nodeId, "title", "Group"); }}
          placeholder="Group" />
      </div>
      <div className="props-section">
        <div className="props-section-title">Color</div>
        <div className="props-aspect-row">
          {COLORS.map((c) => (
            <button key={c} className={`props-color-btn ${color === c ? "active" : ""}`}
              style={{ background: c === "red" ? "#e85d75" : c === "blue" ? "#5b9bd5" : c === "green" ? "#81c784" : c === "purple" ? "#a78bfa" : c === "orange" ? "#ff9800" : "#26c6da" }}
              onClick={() => updateWidgetValue(nodeId, "color", c)} />
          ))}
        </div>
      </div>
    </>
  );
}

// ── Comment Properties ───────────────────────────────────────────
function CommentProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const text = data.widgetValues?.text || "";
  const color = data.widgetValues?.color || "yellow";
  const COLORS = ["yellow", "blue", "green", "red", "purple"];
  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Comment</div>
        <textarea className="props-textarea" value={text} rows={5}
          onChange={(e) => updateWidgetValue(nodeId, "text", e.target.value)}
          placeholder="Write a note..." />
      </div>
      <div className="props-section">
        <div className="props-section-title">Color</div>
        <div className="props-aspect-row">
          {COLORS.map((c) => (
            <button key={c} className={`props-color-btn ${color === c ? "active" : ""}`}
              style={{ background: c === "yellow" ? "#f0c040" : c === "blue" ? "#5b9bd5" : c === "green" ? "#81c784" : c === "red" ? "#e85d75" : "#a78bfa" }}
              onClick={() => updateWidgetValue(nodeId, "color", c)} />
          ))}
        </div>
      </div>
    </>
  );
}

// ── Video Gen Properties ──────────────────────────────────────────
function VideoGenProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const model = data.widgetValues?.model || "veo-2.0-generate-001";
  const ar = data.widgetValues?.aspectRatio || "16:9";
  const VEO = [
    { id: "veo-2.0-generate-001", label: "Veo 2" },
    { id: "veo-3.0-fast-generate-001", label: "Veo 3 Fast" },
    { id: "veo-3.0-generate-001", label: "Veo 3" },
    { id: "veo-3.1-fast-generate-preview", label: "Veo 3.1 Fast" },
    { id: "veo-3.1-lite-generate-preview", label: "Veo 3.1 Lite" },
    { id: "veo-3.1-generate-preview", label: "Veo 3.1" },
  ];
  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Model</div>
        <select className="props-select" value={model}
          onChange={(e) => updateWidgetValue(nodeId, "model", e.target.value)}>
          {VEO.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>
      <div className="props-section">
        <div className="props-section-title">Aspect Ratio</div>
        <div className="props-aspect-row">
          {["16:9", "9:16", "1:1"].map((a) => (
            <button key={a} className={`props-aspect-btn ${ar === a ? "active" : ""}`}
              onClick={() => updateWidgetValue(nodeId, "aspectRatio", a)}>{a}</button>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Imagen Properties ─────────────────────────────────────────────
function ImagenProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const model = data.widgetValues?.model || "imagen-4.0-fast-generate-001";
  const ar = data.widgetValues?.aspectRatio || "1:1";
  const MODELS = [
    { id: "imagen-4.0-fast-generate-001", label: "Imagen 4 Fast" },
    { id: "imagen-4.0-generate-001", label: "Imagen 4" },
    { id: "imagen-4.0-ultra-generate-001", label: "Imagen 4 Ultra" },
  ];
  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Model</div>
        <select className="props-select" value={model}
          onChange={(e) => updateWidgetValue(nodeId, "model", e.target.value)}>
          {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>
      <div className="props-section">
        <div className="props-section-title">Aspect Ratio</div>
        <div className="props-aspect-row">
          {["1:1", "16:9", "9:16", "4:3", "3:4"].map((a) => (
            <button key={a} className={`props-aspect-btn ${ar === a ? "active" : ""}`}
              onClick={() => updateWidgetValue(nodeId, "aspectRatio", a)}>{a}</button>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Music Properties ──────────────────────────────────────────────
function MusicProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const model = data.widgetValues?.model || "lyria-3-clip-preview";
  const MODELS = [
    { id: "lyria-3-clip-preview", label: "Lyria 3 Clip (30s)" },
    { id: "lyria-3-pro-preview", label: "Lyria 3 Pro" },
  ];
  return (
    <div className="props-section">
      <div className="props-section-title">Model</div>
      <select className="props-select" value={model}
        onChange={(e) => updateWidgetValue(nodeId, "model", e.target.value)}>
        {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
    </div>
  );
}

// ── TTS Properties ────────────────────────────────────────────────
function TtsProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const model = data.widgetValues?.model || "gemini-2.5-flash-preview-tts";
  const voice = data.widgetValues?.voice || "Kore";
  const MODELS = [
    { id: "gemini-2.5-flash-preview-tts", label: "TTS Flash" },
    { id: "gemini-2.5-pro-preview-tts", label: "TTS Pro" },
  ];
  const VOICES = ["Kore", "Charon", "Fenrir", "Aoede", "Puck", "Leda", "Orus", "Zephyr"];
  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Model</div>
        <select className="props-select" value={model}
          onChange={(e) => updateWidgetValue(nodeId, "model", e.target.value)}>
          {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>
      <div className="props-section">
        <div className="props-section-title">Voice</div>
        <select className="props-select" value={voice}
          onChange={(e) => updateWidgetValue(nodeId, "voice", e.target.value)}>
          {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
    </>
  );
}

// ── Multi Reference Properties ────────────────────────────────────
function MultiRefProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);

  const width = data.widgetValues?.width ?? 1024;
  const height = data.widgetValues?.height ?? 1024;
  const steps = data.widgetValues?.steps ?? 4;
  const cfg = data.widgetValues?.cfg ?? 1.5;
  const ipWeight = data.widgetValues?.ipWeight ?? 0.35;
  const styleWeight = data.widgetValues?.styleWeight ?? 0.3;

  return (
    <>
      <div className="props-section">
        <div className="props-info-row">
          <span className="props-info-label">Model</span>
          <span className="props-info-value">SDXL Lightning 4-step</span>
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Size</div>
        <div className="props-input-row">
          <input type="number" className="props-input" value={width} min={64} max={2048} step={64}
            onChange={(e) => updateWidgetValue(nodeId, "width", e.target.value === "" ? "" : parseInt(e.target.value) || "")}
            onBlur={(e) => { if (!e.target.value) updateWidgetValue(nodeId, "width", 1024); }} />
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>×</span>
          <input type="number" className="props-input" value={height} min={64} max={2048} step={64}
            onChange={(e) => updateWidgetValue(nodeId, "height", parseInt(e.target.value) || 1024)} />
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Steps</div>
        <div className="props-slider-row">
          <input type="range" className="props-slider" min={1} max={50} value={steps}
            onChange={(e) => updateWidgetValue(nodeId, "steps", parseInt(e.target.value))} />
          <span className="props-slider-value">{steps}</span>
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">CFG Scale</div>
        <div className="props-slider-row">
          <input type="range" className="props-slider" min={1} max={20} step={0.5} value={cfg}
            onChange={(e) => updateWidgetValue(nodeId, "cfg", parseFloat(e.target.value))} />
          <span className="props-slider-value">{cfg}</span>
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Reference Weight</div>
        <div className="props-slider-row">
          <input type="range" className="props-slider" min={0} max={1} step={0.05} value={ipWeight}
            onChange={(e) => updateWidgetValue(nodeId, "ipWeight", parseFloat(e.target.value))} />
          <span className="props-slider-value">{ipWeight}</span>
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Style Weight</div>
        <div className="props-slider-row">
          <input type="range" className="props-slider" min={0} max={1} step={0.05} value={styleWeight}
            onChange={(e) => updateWidgetValue(nodeId, "styleWeight", parseFloat(e.target.value))} />
          <span className="props-slider-value">{styleWeight}</span>
        </div>
      </div>
    </>
  );
}

// ── Scene Properties ──────────────────────────────────────────────
function SceneProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const nodeDefs = useWorkflowStore((s) => s.nodeDefs);

  const sceneTitle = data.widgetValues?.sceneTitle || "";
  const action = data.widgetValues?.action || "";
  const model = data.widgetValues?.model || "";
  const width = data.widgetValues?.width ?? 1024;
  const height = data.widgetValues?.height ?? 576;
  const steps = data.widgetValues?.steps ?? 4;
  const cfg = data.widgetValues?.cfg ?? 7;
  const previewUrl = data.widgetValues?._previewUrl || null;

  const checkpoints: string[] = [];
  for (const loaderName of ["UNETLoader", "UnetLoaderGGUF", "CheckpointLoaderSimple"]) {
    if (nodeDefs[loaderName]) {
      const key = loaderName.includes("UNET") || loaderName.includes("Unet") ? "unet_name" : "ckpt_name";
      const config = nodeDefs[loaderName].input?.required?.[key];
      if (config && Array.isArray(config) && Array.isArray(config[0])) {
        for (const m of config[0]) {
          if (!checkpoints.includes(m)) checkpoints.push(m);
        }
      }
    }
  }

  return (
    <>
      {previewUrl && (
        <div className="props-preview">
          <img src={previewUrl} alt="" />
        </div>
      )}

      <div className="props-section">
        <div className="props-section-title">Scene Title</div>
        <input type="text" className="props-input" value={sceneTitle}
          onChange={(e) => updateWidgetValue(nodeId, "sceneTitle", e.target.value)}
          placeholder="Scene title..." />
      </div>

      <div className="props-section">
        <div className="props-section-title">Action</div>
        <textarea className="props-textarea" value={action} rows={3}
          onChange={(e) => updateWidgetValue(nodeId, "action", e.target.value)}
          placeholder="What happens in this scene..." />
      </div>

      <div className="props-section">
        <div className="props-section-title">Model</div>
        <select className="props-select" value={model}
          onChange={(e) => updateWidgetValue(nodeId, "model", e.target.value)}>
          {checkpoints.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="props-section">
        <div className="props-section-title">Size</div>
        <div className="props-input-row">
          <input type="number" className="props-input" value={width} min={64} max={2048} step={64}
            onChange={(e) => updateWidgetValue(nodeId, "width", e.target.value === "" ? "" : parseInt(e.target.value) || "")}
            onBlur={(e) => { if (!e.target.value) updateWidgetValue(nodeId, "width", 1024); }} />
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>×</span>
          <input type="number" className="props-input" value={height} min={64} max={2048} step={64}
            onChange={(e) => updateWidgetValue(nodeId, "height", e.target.value === "" ? "" : parseInt(e.target.value) || "")}
            onBlur={(e) => { if (!e.target.value) updateWidgetValue(nodeId, "height", 576); }} />
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Steps</div>
        <div className="props-slider-row">
          <input type="range" className="props-slider" min={1} max={50} value={steps}
            onChange={(e) => updateWidgetValue(nodeId, "steps", parseInt(e.target.value))} />
          <span className="props-slider-value">{steps}</span>
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">CFG Scale</div>
        <div className="props-slider-row">
          <input type="range" className="props-slider" min={1} max={20} step={0.5} value={cfg}
            onChange={(e) => updateWidgetValue(nodeId, "cfg", parseFloat(e.target.value))} />
          <span className="props-slider-value">{cfg}</span>
        </div>
      </div>
    </>
  );
}

// ── Storyboard Properties ─────────────────────────────────────────
function StoryboardProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const title = data.widgetValues?.title ?? "";

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Title</div>
        <input type="text" className="props-input" value={title}
          onChange={(e) => updateWidgetValue(nodeId, "title", e.target.value)}
          onBlur={(e) => { if (!e.target.value.trim()) updateWidgetValue(nodeId, "title", "Storyboard"); }}
          placeholder="Storyboard title..." />
      </div>
    </>
  );
}

// ── Character Card Properties ─────────────────────────────────────
function CharacterCardProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const name = data.widgetValues?.name || "";
  const description = data.widgetValues?.description || "";
  const status = data.widgetValues?.status || "draft";
  const portraitUrl = data.widgetValues?.portraitUrl || null;

  const statusColors: Record<string, string> = {
    draft: "#888", approved: "#4caf50", rejected: "#ef5350",
  };

  return (
    <>
      {/* Portrait preview */}
      {portraitUrl && (
        <div className="props-preview">
          <img src={portraitUrl} alt={name} />
        </div>
      )}

      {/* Status badge */}
      <div className="props-section">
        <div className="props-info-row">
          <span className="props-info-label">Status</span>
          <span className="props-info-value" style={{ color: statusColors[status] }}>
            {status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Name */}
      <div className="props-section">
        <div className="props-section-title">Name</div>
        <input
          type="text"
          className="props-input"
          value={name}
          onChange={(e) => updateWidgetValue(nodeId, "name", e.target.value)}
          placeholder="Character name"
        />
      </div>

      {/* Description */}
      <div className="props-section">
        <div className="props-section-title">Description</div>
        <textarea
          className="props-textarea"
          value={description}
          onChange={(e) => updateWidgetValue(nodeId, "description", e.target.value)}
          placeholder="Appearance, personality, traits, backstory..."
          rows={6}
        />
      </div>

      {/* Actions */}
      <div className="props-section">
        <div className="props-file-bar">
          <div className="props-file-bar-btns" style={{ width: "100%", justifyContent: "center" }}>
            {status === "draft" && (
              <>
                <button className="props-file-btn" style={{ color: "#4caf50" }}
                  onClick={() => updateWidgetValue(nodeId, "status", "approved")} title="Approve">Approve</button>
                <button className="props-file-btn" style={{ color: "#ef5350" }}
                  onClick={() => updateWidgetValue(nodeId, "status", "rejected")} title="Reject">Reject</button>
              </>
            )}
            {status !== "draft" && (
              <button className="props-file-btn"
                onClick={() => updateWidgetValue(nodeId, "status", "draft")} title="Reset">Reset to Draft</button>
            )}
          </div>
        </div>
      </div>

      {/* Clear portrait */}
      {portraitUrl && (
        <div className="props-section">
          <button className="props-file-btn props-file-delete"
            onClick={() => updateWidgetValue(nodeId, "portraitUrl", null)}>Remove Portrait</button>
        </div>
      )}
    </>
  );
}

// ── ComfyUI Node Properties ────────────────────────────────────────
function ComfyProperties({ data }: { data: any }) {
  return (
    <div className="props-section">
      <div className="props-info-row">
        <span className="props-info-label">Type</span>
        <span className="props-info-value">{data.type}</span>
      </div>
      <div className="props-info-row">
        <span className="props-info-label">Category</span>
        <span className="props-info-value">{data.category}</span>
      </div>
    </div>
  );
}
