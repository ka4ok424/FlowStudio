import { useWorkflowStore } from "../../store/workflowStore";
import PalettePicker from "./PalettePicker";

const SIZE_PRESETS: Record<"S" | "M" | "L", { w: number; h: number }> = {
  S: { w: 140, h: 140 },
  M: { w: 200, h: 200 },
  L: { w: 280, h: 280 },
};

function StickerProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const update = useWorkflowStore((s) => s.updateWidgetValue);
  const node = useWorkflowStore((s) => s.nodes.find((n) => n.id === nodeId));
  const nodeStyle = (node?.style as { width?: number; height?: number } | undefined) || {};
  const wv = data.widgetValues || {};
  const v = <T,>(k: string, d: T): T => (wv[k] !== undefined ? wv[k] : d);

  const text      = v("text", "") as string;
  const color     = v("color", "cream") as string;
  const fontSize  = v("fontSize", 12) as number;
  const bold      = !!v("bold", false);
  const italic    = !!v("italic", false);
  const underline = !!v("underline", false);
  const strike    = !!v("strikethrough", false);
  const align     = (v("align", "center") as "left" | "center");

  // Effective size (NodeResizer writes top-level width/height; we mirror to style on apply)
  const effW = (node?.width as number | undefined) ?? nodeStyle.width;
  const effH = (node?.height as number | undefined) ?? nodeStyle.height;
  const matches = (k: "S" | "M" | "L") => effW === SIZE_PRESETS[k].w && effH === SIZE_PRESETS[k].h;
  const currentSize = matches("S") ? "S" : matches("L") ? "L" : matches("M") ? "M" : null;

  const applyPreset = (key: "S" | "M" | "L") => {
    const p = SIZE_PRESETS[key];
    // NodeResizer mutates node.width/height; setting only style.* is ignored after a manual
    // resize. Update both — top-level + style — so the preset always wins.
    useWorkflowStore.setState({
      nodes: useWorkflowStore.getState().nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              width: p.w,
              height: p.h,
              style: { ...n.style, width: p.w, height: p.h },
            }
          : n
      ),
    });
  };

  const StyleBtn = ({ k, val, children }: { k: string; val: boolean; children: React.ReactNode }) => (
    <button
      onClick={() => update(nodeId, k, !val)}
      style={{
        flex: 1,
        padding: "6px 8px",
        background: val ? "#3b82f6" : "transparent",
        border: "1px solid var(--border)",
        color: val ? "#fff" : "var(--text-primary)",
        borderRadius: 4,
        cursor: "pointer",
        fontWeight: 600,
      }}
    >{children}</button>
  );

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Size</div>
        <div style={{ display: "flex", gap: 4 }}>
          {(["S", "M", "L"] as const).map((k) => (
            <button
              key={k}
              onClick={() => applyPreset(k)}
              style={{
                flex: 1,
                padding: "6px 8px",
                background: currentSize === k ? "#3b82f6" : "transparent",
                border: "1px solid var(--border)",
                color: currentSize === k ? "#fff" : "var(--text-primary)",
                borderRadius: 4,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >{k}</button>
          ))}
        </div>
        <p className="settings-hint" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
          Or drag the corners on the canvas (sticker is selected).
        </p>
      </div>

      <div className="props-section">
        <div className="props-section-title">Text</div>
        <textarea
          className="props-textarea"
          value={text}
          rows={4}
          onChange={(e) => update(nodeId, "text", e.target.value)}
          placeholder="Sticker text…"
        />
      </div>

      <div className="props-section">
        <div className="props-section-title">Font size ({fontSize}px)</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="range"
            className="props-range"
            min={8}
            max={40}
            step={1}
            value={fontSize}
            onChange={(e) => update(nodeId, "fontSize", parseInt(e.target.value))}
            style={{ flex: 1 }}
          />
          {/* Compact align switcher right next to the slider */}
          <button
            onClick={() => update(nodeId, "align", "left")}
            title="Align left"
            style={{
              padding: "4px 8px", borderRadius: 4, cursor: "pointer",
              border: "1px solid var(--border)",
              background: align === "left" ? "#3b82f6" : "transparent",
              color: align === "left" ? "#fff" : "var(--text-primary)",
              fontSize: 14, lineHeight: 1, height: 26,
            }}
          >⬅︎</button>
          <button
            onClick={() => update(nodeId, "align", "center")}
            title="Align center"
            style={{
              padding: "4px 8px", borderRadius: 4, cursor: "pointer",
              border: "1px solid var(--border)",
              background: align === "center" ? "#3b82f6" : "transparent",
              color: align === "center" ? "#fff" : "var(--text-primary)",
              fontSize: 14, lineHeight: 1, height: 26,
            }}
          >⬌</button>
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Style</div>
        <div style={{ display: "flex", gap: 4 }}>
          <StyleBtn k="bold" val={bold}><b>B</b></StyleBtn>
          <StyleBtn k="italic" val={italic}><i>I</i></StyleBtn>
          <StyleBtn k="underline" val={underline}><u>U</u></StyleBtn>
          <StyleBtn k="strikethrough" val={strike}><s>S</s></StyleBtn>
        </div>
      </div>

      <PalettePicker value={color} onChange={(id) => update(nodeId, "color", id)} title="Sticker color" />
    </>
  );
}

export default StickerProperties;
