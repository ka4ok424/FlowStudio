import { useWorkflowStore } from "../../store/workflowStore";
import PalettePicker from "./PalettePicker";

function TextProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const update = useWorkflowStore((s) => s.updateWidgetValue);
  const wv = data.widgetValues || {};
  const v = <T,>(k: string, d: T): T => (wv[k] !== undefined ? wv[k] : d);

  const fontSize  = v("fontSize", 16) as number;
  const bold      = !!v("bold", false);
  const italic    = !!v("italic", false);
  const underline = !!v("underline", false);
  const strike    = !!v("strikethrough", false);
  const align     = v("align", "left") as "left" | "center" | "right";
  const color     = v("color", "white") as string;
  const text      = v("text", "") as string;

  const toggle = (key: string, value: boolean) => update(nodeId, key, value);
  const StyleBtn = ({ k, val, children }: { k: string; val: boolean; children: React.ReactNode }) => (
    <button
      onClick={() => toggle(k, !val)}
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
  const AlignBtn = ({ v: av, children }: { v: "left" | "center" | "right"; children: React.ReactNode }) => (
    <button
      onClick={() => update(nodeId, "align", av)}
      style={{
        flex: 1,
        padding: "6px 8px",
        background: align === av ? "#3b82f6" : "transparent",
        border: "1px solid var(--border)",
        color: align === av ? "#fff" : "var(--text-primary)",
        borderRadius: 4,
        cursor: "pointer",
      }}
    >{children}</button>
  );

  return (
    <>
      <div className="props-section">
        <div className="props-section-title">Text</div>
        <textarea
          className="props-textarea"
          value={text}
          rows={4}
          onChange={(e) => update(nodeId, "text", e.target.value)}
          placeholder="Label text…"
        />
      </div>

      <div className="props-section">
        <div className="props-section-title">Font size ({fontSize}px)</div>
        <input
          type="range"
          className="props-range"
          min={8}
          max={96}
          step={1}
          value={fontSize}
          onChange={(e) => update(nodeId, "fontSize", parseInt(e.target.value))}
        />
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

      <div className="props-section">
        <div className="props-section-title">Align</div>
        <div style={{ display: "flex", gap: 4 }}>
          <AlignBtn v="left">⬅︎</AlignBtn>
          <AlignBtn v="center">⬌</AlignBtn>
          <AlignBtn v="right">➡︎</AlignBtn>
        </div>
      </div>

      <PalettePicker value={color} onChange={(id) => update(nodeId, "color", id)} title="Color" />
    </>
  );
}

export default TextProperties;
