import { EXTENDED_COLORS } from "../../utils/extendedPalette";

/**
 * 4-column palette picker in the style of Miro's "All colors" grid.
 * Grouped by hue (6 rows × 4 cols). Selected color shows a check mark.
 */
export default function PalettePicker({
  value,
  onChange,
  title = "Color",
}: {
  value: string;
  onChange: (id: string) => void;
  title?: string;
}) {
  return (
    <div className="props-section">
      <div className="props-section-title">{title}</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          gap: 4,
          padding: "2px 0",
        }}
      >
        {EXTENDED_COLORS.map((c) => {
          const active = value === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onChange(c.id)}
              title={c.label}
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                borderRadius: "50%",
                background: c.hex,
                border: active ? "1.5px solid #fff" : "1px solid rgba(255,255,255,0.18)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                color: pickContrast(c.hex),
                transition: "transform 0.08s",
                transform: active ? "scale(1.15)" : "scale(1)",
                padding: 0,
              }}
            >
              {active ? "✓" : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function pickContrast(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1a1a1a" : "#ffffff";
}
