import { create } from "zustand";

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
  addLog: (entry: Omit<LogEntry, "id" | "time">) => void;
  clear: () => void;
}

const MAX_LOGS = 500;

export const useLogStore = create<LogState>((set, get) => ({
  entries: [],

  addLog: (entry) => {
    const logEntry: LogEntry = {
      ...entry,
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      time: Date.now(),
    };
    set({ entries: [...get().entries.slice(-(MAX_LOGS - 1)), logEntry] });
  },

  clear: () => set({ entries: [] }),
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
