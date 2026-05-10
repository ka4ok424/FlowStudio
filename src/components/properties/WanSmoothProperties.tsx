import { useWorkflowStore } from "../../store/workflowStore";
import { SMOOTH_NEGATIVE_DEFAULT } from "../../workflows/wanSmooth";

function WanSmoothProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const nodeDefs = useWorkflowStore((s) => s.nodeDefs);

  const steps = data.widgetValues?.steps ?? 20;
  const cfg = data.widgetValues?.cfg ?? 6.0;
  const shift = data.widgetValues?.shift ?? 5.0;
  const width = data.widgetValues?.width ?? 720;
  const height = data.widgetValues?.height ?? 1280;
  const numFrames = data.widgetValues?.numFrames ?? 49;
  const fps = data.widgetValues?.fps ?? 16;
  const rifeMultiplier = data.widgetValues?.rifeMultiplier ?? 2;
  const seed = data.widgetValues?.seed ?? "";
  const modelName = data.widgetValues?.modelName ?? "wan2.2_ti2v_5B_fp16.safetensors";
  const vaeName = data.widgetValues?.vaeName ?? "Wan2.2_VAE.pth";
  const clipName = data.widgetValues?.clipName ?? "umt5_xxl_fp8_e4m3fn_scaled.safetensors";
  const samplerName = data.widgetValues?.samplerName ?? "uni_pc";
  const scheduler = data.widgetValues?.scheduler ?? "simple";
  const negativePrompt = data.widgetValues?.negativePrompt ?? "";

  const applyPreset = (preset: "5B" | "Lightx2v") => {
    if (preset === "5B") {
      updateWidgetValue(nodeId, "steps", 20);
      updateWidgetValue(nodeId, "cfg", 6.0);
      updateWidgetValue(nodeId, "shift", 5.0);
      updateWidgetValue(nodeId, "samplerName", "uni_pc");
      updateWidgetValue(nodeId, "scheduler", "simple");
    } else {
      updateWidgetValue(nodeId, "steps", 6);
      updateWidgetValue(nodeId, "cfg", 1.0);
      updateWidgetValue(nodeId, "shift", 8.0);
      updateWidgetValue(nodeId, "samplerName", "euler");
      updateWidgetValue(nodeId, "scheduler", "simple");
    }
  };
  const isPreset5B = steps === 20 && cfg === 6.0 && shift === 5.0 && samplerName === "uni_pc";
  const isPresetLightx2v = steps === 6 && cfg === 1.0 && shift === 8.0 && samplerName === "euler";

  const finalFps = fps * Math.max(1, rifeMultiplier);
  const duration = (numFrames / fps).toFixed(1);

  const unetModels: string[] = nodeDefs?.UNETLoader?.input?.required?.unet_name?.[0] ?? [];
  const wanModels = unetModels.filter((m) => m.toLowerCase().includes("wan") || m.toLowerCase().includes("smooth"));
  const vaes: string[] = nodeDefs?.VAELoader?.input?.required?.vae_name?.[0] ?? [];
  const wanVaes = vaes.filter((v) => v.toLowerCase().includes("wan"));
  const clips: string[] = nodeDefs?.CLIPLoader?.input?.required?.clip_name?.[0] ?? [];
  const wanClips = clips.filter((c) => c.toLowerCase().includes("umt5") || c.toLowerCase().includes("wan"));

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Quality Preset</div>
        <div className="props-aspect-row">
          <button className={`props-aspect-btn ${isPreset5B ? "active" : ""}`}
            onClick={() => applyPreset("5B")}>
            TI2V-5B (vanilla)
          </button>
          <button className={`props-aspect-btn ${isPresetLightx2v ? "active" : ""}`}
            onClick={() => applyPreset("Lightx2v")}>
            14B+Lightx2v
          </button>
        </div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
          {isPreset5B && "✓ TI2V-5B optimal — 20 steps, cfg 6, uni_pc/simple"}
          {isPresetLightx2v && "✓ 14B + Lightx2v 4-step LoRA — 6 steps, cfg 1, euler"}
          {!isPreset5B && !isPresetLightx2v && "Custom — adjust below"}
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Model (UNET)</div>
        <select className="props-select" value={modelName}
          onChange={(e) => updateWidgetValue(nodeId, "modelName", e.target.value)}>
          {(wanModels.length ? wanModels : unetModels).map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <div className="props-section">
        <div className="props-section-title">Frames ({duration}s @ {fps}fps src → {finalFps}fps out)</div>
        <input type="range" className="props-range" min={13} max={129} step={4} value={numFrames}
          onChange={(e) => updateWidgetValue(nodeId, "numFrames", parseInt(e.target.value))} />
        <span className="props-range-value">{numFrames}</span>
      </div>

      <div className="props-section">
        <div className="props-section-title">RIFE Multiplier (smoothness)</div>
        <div className="props-aspect-row">
          {[1, 2, 3, 4].map((m) => (
            <button key={m}
              className={`props-aspect-btn ${rifeMultiplier === m ? "active" : ""}`}
              onClick={() => updateWidgetValue(nodeId, "rifeMultiplier", m)}>
              {m === 1 ? "Off" : `×${m}`}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
          {rifeMultiplier === 1 ? "RIFE disabled — raw Wan output" : `Generates ${rifeMultiplier}× more frames via RIFE → silky smooth`}
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">FPS (source)</div>
        <input type="range" className="props-range" min={8} max={30} step={1} value={fps}
          onChange={(e) => updateWidgetValue(nodeId, "fps", parseInt(e.target.value))} />
        <span className="props-range-value">{fps}</span>
      </div>

      <div className="props-section">
        <div className="props-section-title">Size</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input className="props-input" type="number" value={width ?? ""} min={64} max={2048}
            onChange={(e) => updateWidgetValue(nodeId, "width", e.target.value === "" ? "" : Math.min(2048, parseInt(e.target.value)))}
            onBlur={() => { if (!width || isNaN(width)) updateWidgetValue(nodeId, "width", 720); }} style={{ width: "50%" }} />
          <span style={{ color: "var(--text-muted)", alignSelf: "center" }}>x</span>
          <input className="props-input" type="number" value={height ?? ""} min={64} max={2048}
            onChange={(e) => updateWidgetValue(nodeId, "height", e.target.value === "" ? "" : Math.min(2048, parseInt(e.target.value)))}
            onBlur={() => { if (!height || isNaN(height)) updateWidgetValue(nodeId, "height", 1280); }} style={{ width: "50%" }} />
        </div>
        <div className="props-aspect-row" style={{ marginTop: 10 }}>
          {[{w:1280,h:720,l:"16:9"},{w:720,h:1280,l:"9:16"},{w:1024,h:1024,l:"1:1"},{w:832,h:480,l:"SD"}].map((s) => (
            <button key={s.l} className={`props-aspect-btn ${width === s.w && height === s.h ? "active" : ""}`}
              onClick={() => { updateWidgetValue(nodeId, "width", s.w); updateWidgetValue(nodeId, "height", s.h); }}>{s.l}</button>
          ))}
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Steps <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400 }}>(5B: 20, Lightx2v: 6)</span></div>
        <input type="range" className="props-range" min={2} max={50} step={1} value={steps}
          onChange={(e) => updateWidgetValue(nodeId, "steps", parseInt(e.target.value))} />
        <span className="props-range-value">{steps}</span>
      </div>

      <div className="props-section">
        <div className="props-section-title">CFG <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400 }}>(5B: 6.0, Lightx2v: 1.0)</span></div>
        <input type="range" className="props-range" min={1} max={15} step={0.5} value={cfg}
          onChange={(e) => updateWidgetValue(nodeId, "cfg", parseFloat(e.target.value))} />
        <span className="props-range-value">{cfg.toFixed(1)}</span>
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
          <div className="props-section-title">Flow Shift <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400 }}>(5B: 5.0, Lightx2v: 8.0)</span></div>
          <input type="range" className="props-range" min={0} max={20} step={0.5} value={shift}
            onChange={(e) => updateWidgetValue(nodeId, "shift", parseFloat(e.target.value))} />
          <span className="props-range-value">{shift.toFixed(1)}</span>
        </div>

        <div className="props-section">
          <div className="props-section-title">Sampler</div>
          <select className="props-select" value={samplerName}
            onChange={(e) => updateWidgetValue(nodeId, "samplerName", e.target.value)}>
            {["uni_pc", "euler", "euler_ancestral", "dpmpp_2m", "dpmpp_sde", "ddim", "lcm"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="props-section">
          <div className="props-section-title">Scheduler</div>
          <select className="props-select" value={scheduler}
            onChange={(e) => updateWidgetValue(nodeId, "scheduler", e.target.value)}>
            {["simple", "normal", "karras", "exponential", "sgm_uniform", "ddim_uniform", "beta"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="props-section">
          <div className="props-section-title">Negative Prompt</div>
          <textarea className="props-textarea" value={negativePrompt} rows={4}
            placeholder={SMOOTH_NEGATIVE_DEFAULT.slice(0, 80) + "..."}
            onChange={(e) => updateWidgetValue(nodeId, "negativePrompt", e.target.value)} />
          <button className="props-temp-clear"
            onClick={() => updateWidgetValue(nodeId, "negativePrompt", SMOOTH_NEGATIVE_DEFAULT)}>
            Use Smooth default (Chinese)
          </button>
        </div>

        <div className="props-section">
          <div className="props-section-title">VAE</div>
          <select className="props-select" value={vaeName}
            onChange={(e) => updateWidgetValue(nodeId, "vaeName", e.target.value)}>
            {(wanVaes.length ? wanVaes : vaes).map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>

        <div className="props-section">
          <div className="props-section-title">CLIP (text encoder)</div>
          <select className="props-select" value={clipName}
            onChange={(e) => updateWidgetValue(nodeId, "clipName", e.target.value)}>
            {(wanClips.length ? wanClips : clips).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </details>
    </>
  );
}

export default WanSmoothProperties;
