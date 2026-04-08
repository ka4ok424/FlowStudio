import { create } from "zustand";

export interface MediaItem {
  id: string;
  type: "image" | "video" | "audio";
  url: string;           // blob URL or data URL
  thumbnail?: string;    // smaller preview
  fileName: string;
  source: "imported" | "generated";
  favorite: boolean;
  folder?: string;
  createdAt: number;
  // Generation metadata (only for generated)
  genMeta?: {
    prompt: string;
    model: string;
    seed: string;
    steps?: number;
    cfg?: number;
    width?: number;
    height?: number;
    nodeType: string;    // "fs:localGenerate" or "fs:nanoBanana"
    duration?: number;   // generation time in ms
  };
}

interface MediaState {
  items: MediaItem[];
  addItem: (item: MediaItem) => void;
  removeItem: (id: string) => void;
  toggleFavorite: (id: string) => void;
  setFolder: (id: string, folder: string) => void;
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

const STORAGE_KEY = "flowstudio_media_library";

export const useMediaStore = create<MediaState>((set, get) => ({
  items: [],

  addItem: (item) => {
    set({ items: [item, ...get().items] });
    get().saveToStorage();
  },

  removeItem: (id) => {
    set({ items: get().items.filter((i) => i.id !== id) });
    get().saveToStorage();
  },

  toggleFavorite: (id) => {
    set({
      items: get().items.map((i) =>
        i.id === id ? { ...i, favorite: !i.favorite } : i
      ),
    });
    get().saveToStorage();
  },

  setFolder: (id, folder) => {
    set({
      items: get().items.map((i) =>
        i.id === id ? { ...i, folder } : i
      ),
    });
    get().saveToStorage();
  },

  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const items = JSON.parse(raw);
        set({ items });
      }
    } catch { /* ignore */ }
  },

  saveToStorage: () => {
    try {
      // Save metadata only (not blob URLs — they expire)
      const items = get().items.map((i) => ({
        ...i,
        // Keep data URLs, drop blob URLs
        url: i.url.startsWith("data:") ? i.url : "",
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch { /* storage full */ }
  },
}));

// Helper to add a generation result
export function addGenerationToLibrary(
  url: string,
  meta: MediaItem["genMeta"]
) {
  const item: MediaItem = {
    id: `gen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: "image",
    url,
    fileName: `generation_${Date.now()}.png`,
    source: "generated",
    favorite: false,
    createdAt: Date.now(),
    genMeta: meta,
  };
  useMediaStore.getState().addItem(item);
  return item;
}
