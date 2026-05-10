import { useWorkflowStore } from "../../store/workflowStore";

function MmAudioProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const nodeDefs = useWorkflowStore((s) => s.nodeDefs);

  const steps = data.widgetValues?.steps ?? 25;
  const cfg = data.widgetValues?.cfg ?? 4.5;
  const duration = data.widgetValues?.duration ?? 8;
  const fps = data.widgetValues?.fps ?? 24;
  const seed = data.widgetValues?.seed ?? "";
  const negativePrompt = data.widgetValues?.negativePrompt ?? "";
  const maskAwayClip = !!data.widgetValues?.maskAwayClip;
  const mmaudioModel = data.widgetValues?.mmaudioModel ?? "mmaudio_large_44k_v2_fp16.safetensors";
  const vaeModel = data.widgetValues?.vaeModel ?? "mmaudio_vae_44k_fp16.safetensors";
  const synchformerModel = data.widgetValues?.synchformerModel ?? "mmaudio_synchformer_fp16.safetensors";
  const clipModel = data.widgetValues?.clipModel ?? "apple_DFN5B-CLIP-ViT-H-14-384_fp16.safetensors";

  const mmaudioFiles: string[] = nodeDefs?.MMAudioModelLoader?.input?.required?.mmaudio_model?.[0] ?? [];
  const featFiles: string[] = nodeDefs?.MMAudioFeatureUtilsLoader?.input?.required?.vae_model?.[0] ?? mmaudioFiles;

  const mmaudioMains = mmaudioFiles.filter((f) => f.toLowerCase().includes("mmaudio") && !f.toLowerCase().includes("vae") && !f.toLowerCase().includes("synch") && !f.toLowerCase().includes("clip"));
  const vaes = featFiles.filter((f) => f.toLowerCase().includes("vae"));
  const synchformers = featFiles.filter((f) => f.toLowerCase().includes("synch"));
  const clips = featFiles.filter((f) => f.toLowerCase().includes("clip") || f.toLowerCase().includes("dfn5b"));

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Duration (seconds)</div>
        <input type="range" className="props-range" min={1} max={30} step={0.5} value={duration}
          onChange={(e) => updateWidgetValue(nodeId, "duration", parseFloat(e.target.value))} />
        <span className="props-range-value">{duration}s</span>
        <p className="settings-hint" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4 }}>
          Match this to your video length. MMAudio Large 44k = max ~8s reliable; longer may degrade.
        </p>
      </div>

      <div className="props-section">
        <div className="props-section-title">FPS (of source video)</div>
        <input type="range" className="props-range" min={8} max={30} step={1} value={fps}
          onChange={(e) => updateWidgetValue(nodeId, "fps", parseInt(e.target.value))} />
        <span className="props-range-value">{fps}</span>
      </div>

      <div className="props-section">
        <div className="props-section-title">Steps</div>
        <input type="range" className="props-range" min={5} max={50} step={1} value={steps}
          onChange={(e) => updateWidgetValue(nodeId, "steps", parseInt(e.target.value))} />
        <span className="props-range-value">{steps}</span>
      </div>

      <div className="props-section">
        <div className="props-section-title">CFG (prompt guidance)</div>
        <input type="range" className="props-range" min={1} max={10} step={0.1} value={cfg}
          onChange={(e) => updateWidgetValue(nodeId, "cfg", parseFloat(e.target.value))} />
        <span className="props-range-value">{cfg.toFixed(1)}</span>
        <p className="settings-hint" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4 }}>
          4.5 default. Higher = audio matches prompt more strictly. Lower = more variation, more sync to video motion.
        </p>
      </div>

      <div className="props-section">
        <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer" }}>
          <input type="checkbox" checked={maskAwayClip}
            onChange={(e) => updateWidgetValue(nodeId, "maskAwayClip", e.target.checked)} />
          <span>Mask Away CLIP <span style={{ color: "var(--text-muted)", fontSize: 11 }}>(use sync only)</span></span>
        </label>
        <p className="settings-hint" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4 }}>
          When enabled, only motion-sync features (Synchformer) are used. Useful when prompt fully describes audio and video CLIP semantics would mislead.
        </p>
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
          <div className="props-section-title">Negative Prompt</div>
          <textarea className="props-textarea" value={negativePrompt} rows={2}
            placeholder="What sounds to avoid (e.g., music, voices, noise)..."
            onChange={(e) => updateWidgetValue(nodeId, "negativePrompt", e.target.value)} />
        </div>

        <div className="props-section">
          <div className="props-section-title">MMAudio Model</div>
          <select className="props-select" value={mmaudioModel}
            onChange={(e) => updateWidgetValue(nodeId, "mmaudioModel", e.target.value)}>
            {(mmaudioMains.length ? mmaudioMains : mmaudioFiles).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="props-section">
          <div className="props-section-title">Audio VAE</div>
          <select className="props-select" value={vaeModel}
            onChange={(e) => updateWidgetValue(nodeId, "vaeModel", e.target.value)}>
            {(vaes.length ? vaes : featFiles).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="props-section">
          <div className="props-section-title">Synchformer</div>
          <select className="props-select" value={synchformerModel}
            onChange={(e) => updateWidgetValue(nodeId, "synchformerModel", e.target.value)}>
            {(synchformers.length ? synchformers : featFiles).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="props-section">
          <div className="props-section-title">CLIP (semantic)</div>
          <select className="props-select" value={clipModel}
            onChange={(e) => updateWidgetValue(nodeId, "clipModel", e.target.value)}>
            {(clips.length ? clips : featFiles).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </details>
    </>
  );
}

export default MmAudioProperties;
