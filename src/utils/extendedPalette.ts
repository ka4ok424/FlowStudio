// 24-color palette grouped by hue (like Miro's "All colors" panel).
// Shared between TextNode, StickerNode, and any future free-text UI.

export interface PaletteColor {
  id: string;
  hex: string;
  label: string;
  row: number;       // row index for 4-column grid
}

export const EXTENDED_COLORS: PaletteColor[] = [
  // Row 1 — yellow family
  { id: "cream",      hex: "#fff59d", label: "Cream",        row: 0 },
  { id: "yellow",     hex: "#fdd835", label: "Yellow",       row: 0 },
  { id: "ochre",      hex: "#b8860b", label: "Ochre",        row: 0 },
  { id: "white",      hex: "#ffffff", label: "White",        row: 0 },
  // Row 2 — orange / brown / neutral
  { id: "peach",      hex: "#ffcc80", label: "Peach",        row: 1 },
  { id: "orange",     hex: "#ff9800", label: "Orange",       row: 1 },
  { id: "brown",      hex: "#6d4c41", label: "Brown",        row: 1 },
  { id: "lightGray",  hex: "#e0e0e0", label: "Light Gray",   row: 1 },
  // Row 3 — pink / red
  { id: "lightPink",  hex: "#f8bbd0", label: "Light Pink",   row: 2 },
  { id: "pink",       hex: "#f48fb1", label: "Pink",         row: 2 },
  { id: "red",        hex: "#c62828", label: "Red",          row: 2 },
  { id: "gray",       hex: "#bdbdbd", label: "Gray",         row: 2 },
  // Row 4 — green
  { id: "lightGreen", hex: "#a5d6a7", label: "Light Green",  row: 3 },
  { id: "green",      hex: "#66bb6a", label: "Green",        row: 3 },
  { id: "darkGreen",  hex: "#2e7d32", label: "Dark Green",   row: 3 },
  { id: "dimGray",    hex: "#616161", label: "Dim Gray",     row: 3 },
  // Row 5 — blue
  { id: "lightBlue",  hex: "#90caf9", label: "Light Blue",   row: 4 },
  { id: "blue",       hex: "#42a5f5", label: "Blue",         row: 4 },
  { id: "darkBlue",   hex: "#1565c0", label: "Dark Blue",    row: 4 },
  { id: "black",      hex: "#212121", label: "Black",        row: 4 },
  // Row 6 — purple
  { id: "lightPurple",hex: "#d1c4e9", label: "Light Purple", row: 5 },
  { id: "purple",     hex: "#a78bfa", label: "Purple",       row: 5 },
  { id: "darkPurple", hex: "#5e35b1", label: "Dark Purple",  row: 5 },
  { id: "fuchsia",    hex: "#e040fb", label: "Fuchsia",      row: 5 },
];

export function paletteHex(id: string | undefined, fallback = "#212121"): string {
  if (!id) return fallback;
  return EXTENDED_COLORS.find((c) => c.id === id)?.hex || fallback;
}
