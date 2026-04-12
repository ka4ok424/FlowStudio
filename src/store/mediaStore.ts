import { create } from "zustand";
import { saveImage, loadImage } from "./imageDb";

export interface MediaItem {
  id: string;
  type: "image" | "video" | "audio";
  url: string;           // data URL (in memory), stored in IndexedDB
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
  // Publishing metadata
  publishMeta?: {
    platform: string;    // "tiktok", "youtube", etc.
    publishId: string;   // platform-specific ID for tracking
    publishedAt: number;
    caption?: string;
    privacy?: string;
    status: "sent" | "published" | "failed";
  }[];
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
    // Auto-detect dimensions for images
    if (item.url && item.url.startsWith("data:image") && item.genMeta && !item.genMeta.width) {
      const img = new Image();
      img.onload = () => {
        const updated = get().items.map((i) =>
          i.id === item.id && i.genMeta ? { ...i, genMeta: { ...i.genMeta!, width: img.width, height: img.height } } : i
        );
        set({ items: updated });
        get().saveToStorage();
      };
      img.src = item.url;
    }

    // Save image data to IndexedDB, keep only small placeholder in memory
    if (item.url && item.url.startsWith("data:")) {
      saveImage(`media_${item.id}`, item.url).catch(() => {});
      const memItem = { ...item, url: `__idb_media__:${item.id}` };
      set({ items: [memItem, ...get().items] });
    } else {
      set({ items: [item, ...get().items] });
    }
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
      if (!raw) return;
      const metaItems = JSON.parse(raw) as MediaItem[];
      // Load image data from IndexedDB for each item
      const items = metaItems.filter((i) => !!i.id);
      set({ items });
      // Restore URLs from IndexedDB in background
      for (const item of items) {
        if (!item.url || item.url === "__idb__") {
          loadImage(`media_${item.id}`).then((dataUrl) => {
            if (dataUrl) {
              const updated = get().items.map((i) =>
                i.id === item.id ? { ...i, url: dataUrl } : i
              );
              set({ items: updated });
            }
          }).catch(() => {});
        }
      }
    } catch { /* ignore */ }
  },

  saveToStorage: () => {
    try {
      // Save only metadata to localStorage (no image data — that's in IndexedDB)
      const items = get().items.map((i) => ({
        ...i,
        url: (i.url && i.url.startsWith("data:")) ? "__idb__" : i.url || "",
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.error("[MediaStore] saveToStorage failed:", e);
    }
  },
}));

// Helper to add a generation result
export function addGenerationToLibrary(
  url: string,
  meta: MediaItem["genMeta"],
  mediaType: "image" | "video" | "audio" = "image"
) {
  const ext = mediaType === "video" ? "mp4" : mediaType === "audio" ? "wav" : "png";
  const item: MediaItem = {
    id: `gen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: mediaType,
    url,
    fileName: `generation_${Date.now()}.${ext}`,
    source: "generated",
    favorite: false,
    createdAt: Date.now(),
    genMeta: meta,
  };
  useMediaStore.getState().addItem(item);
  return item;
}
