import { create } from "zustand";
import { saveImage, loadImage } from "./imageDb";

export interface LogEntry {
  id: string;
  time: number;
  nodeId?: string;
  nodeType?: string;
  nodeLabel?: string;
  action: string;
  status: "info" | "success" | "error" | "warning";
  details?: string;
}

interface LogState {
  entries: LogEntry[];
  loaded: boolean;
  panelOpen: boolean;
  filterNodeId: string | null;
  addLog: (entry: Omit<LogEntry, "id" | "time">) => void;
  clear: () => void;
  loadLogs: () => Promise<void>;
  openPanel: (nodeId?: string | null) => void;
  closePanel: () => void;
  togglePanel: () => void;
}

const MAX_LOGS = 500;
const LOG_STORAGE_KEY = "flowstudio_logs";

// Save with project autosave (every 5 sec) — called from App.tsx
export function saveLogsNow() {
  const entries = useLogStore.getState().entries;
  saveImage(LOG_STORAGE_KEY, JSON.stringify(entries.slice(-MAX_LOGS))).catch(() => {});
}

export const useLogStore = create<LogState>((set, get) => ({
  entries: [],
  loaded: false,
  panelOpen: false,
  filterNodeId: null,

  openPanel: (nodeId = null) => set({ panelOpen: true, filterNodeId: nodeId }),
  closePanel: () => set({ panelOpen: false, filterNodeId: null }),
  togglePanel: () => set({ panelOpen: !get().panelOpen, filterNodeId: get().panelOpen ? null : get().filterNodeId }),

  addLog: (entry) => {
    const logEntry: LogEntry = {
      ...entry,
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      time: Date.now(),
    };
    const updated = [...get().entries.slice(-(MAX_LOGS - 1)), logEntry];
    set({ entries: updated });
  },

  clear: () => {
    set({ entries: [] });
    saveImage(LOG_STORAGE_KEY, "[]").catch(() => {});
  },

  loadLogs: async () => {
    if (get().loaded) return;
    try {
      const raw = await loadImage(LOG_STORAGE_KEY);
      if (raw) {
        const entries = JSON.parse(raw) as LogEntry[];
        set({ entries: entries.slice(-MAX_LOGS), loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },
}));

// Global helper — call from anywhere
export function log(
  action: string,
  opts?: {
    nodeId?: string;
    nodeType?: string;
    nodeLabel?: string;
    status?: "info" | "success" | "error" | "warning";
    details?: string;
  }
) {
  useLogStore.getState().addLog({
    action,
    nodeId: opts?.nodeId,
    nodeType: opts?.nodeType,
    nodeLabel: opts?.nodeLabel,
    status: opts?.status || "info",
    details: opts?.details,
  });
}
