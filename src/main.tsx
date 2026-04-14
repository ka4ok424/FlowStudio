import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { useWorkflowStore } from "./store/workflowStore";
import { useMediaStore } from "./store/mediaStore";

// ── Request persistent storage (prevent Chrome eviction) ──
navigator.storage?.persist?.().then((granted) => {
  console.log(`[Storage] Persistent storage: ${granted ? "GRANTED" : "DENIED (best-effort)"}`);
  if (!granted) {
    console.warn("[Storage] Data may be evicted by Chrome. Export projects regularly!");
  }
}).catch(() => {});

// Debug API — accessible from browser console or external tools
// Usage: window.__debug.getState(), window.__debug.checkSave(), etc.
(window as any).__debug = {
  store: useWorkflowStore,
  mediaStore: useMediaStore,

  getState: () => {
    const wf = useWorkflowStore.getState();
    const media = useMediaStore.getState();
    const IMAGE_FIELDS = ["portraitUrl", "_previewUrl", "_preview"];

    const nodeImages = wf.nodes.map((n: any) => {
      const wv = n.data?.widgetValues || {};
      const urls: Record<string, string> = {};
      for (const f of IMAGE_FIELDS) {
        const val = wv[f];
        if (val) {
          const type = val.startsWith("data:") ? "DATA" :
                       val.startsWith("__idb__") ? "IDB" :
                       val.startsWith("/api") ? "API" :
                       val.startsWith("blob:") ? "BLOB" : "OTHER";
          urls[f] = `${type}(${val.length})`;
        }
      }
      if (Object.keys(urls).length === 0) return null;
      return { id: n.id, type: n.data?.type, urls };
    }).filter(Boolean);

    let lsSize = 0;
    for (const k in localStorage) {
      if (localStorage.hasOwnProperty(k)) {
        lsSize += (localStorage.getItem(k) || "").length;
      }
    }

    return {
      project: { id: wf.currentProjectId, name: wf.currentProjectName },
      nodes: wf.nodes.length,
      nodeImages,
      media: { total: media.items.length, withUrl: media.items.filter((i: any) => !!i.url).length },
      localStorageMB: (lsSize / 1024 / 1024).toFixed(2),
    };
  },

  checkSave: async () => {
    const wf = useWorkflowStore.getState();
    const pid = wf.currentProjectId;
    const before = wf.nodes.length;
    const results: Record<string, any> = { project: wf.currentProjectName, nodesInMemory: before };

    // 1. Test IDB write + read-back
    try {
      await wf.saveProject();
      results.saveCall = "OK";
    } catch (e: any) {
      results.saveCall = "FAILED: " + e.message;
    }

    // 2. Check IDB main key
    try {
      const { loadImage } = await import("./store/imageDb");
      const idbData = await loadImage(`project_${pid}`);
      if (idbData) {
        const parsed = JSON.parse(idbData);
        results.idbMain = { status: "OK", nodes: parsed.nodes?.length, sizeKB: Math.round(idbData.length / 1024) };
      } else {
        results.idbMain = { status: "EMPTY" };
      }
    } catch (e: any) {
      results.idbMain = { status: "DEAD", error: e.message?.slice(0, 80) };
    }

    // 3. Check IDB backup key
    try {
      const { loadImage } = await import("./store/imageDb");
      const idbBk = await loadImage(`project_${pid}_backup`);
      results.idbBackup = idbBk ? "OK" : "EMPTY";
    } catch (e: any) {
      results.idbBackup = "DEAD: " + e.message?.slice(0, 60);
    }

    // 4. Check localStorage fallback
    const lsData = localStorage.getItem(`flowstudio_ls_${pid}`);
    if (lsData) {
      try {
        const parsed = JSON.parse(lsData);
        results.localStorageFallback = { status: "OK", nodes: parsed.nodes?.length, sizeKB: Math.round(lsData.length / 1024) };
      } catch {
        results.localStorageFallback = { status: "CORRUPT" };
      }
    } else {
      results.localStorageFallback = { status: "MISSING" };
    }

    // 5. Check persistent storage
    try {
      const persisted = await navigator.storage?.persisted?.();
      const estimate = await navigator.storage?.estimate?.();
      results.storage = {
        persistent: persisted ? "YES" : "NO (best-effort!)",
        usedMB: Math.round((estimate?.usage || 0) / 1024 / 1024),
        quotaMB: Math.round((estimate?.quota || 0) / 1024 / 1024),
      };
    } catch { results.storage = "unavailable"; }

    // 6. Summary
    const idbOk = results.idbMain?.status === "OK";
    const lsOk = results.localStorageFallback?.status === "OK";
    results.VERDICT = idbOk && lsOk ? "ALL GOOD" : idbOk ? "OK (no LS fallback)" : lsOk ? "IDB BROKEN — saved by localStorage!" : "DANGER — nothing works!";

    console.table ? console.table(results) : console.log(results);
    return results;
  },

  forceConvert: async () => {
    // Force convert all API/blob URLs to data URLs
    const wf = useWorkflowStore.getState();
    const IMAGE_FIELDS = ["portraitUrl", "_previewUrl", "_preview"];
    let converted = 0;
    for (const n of wf.nodes as any[]) {
      const wv = n.data?.widgetValues;
      if (!wv) continue;
      for (const f of IMAGE_FIELDS) {
        const val = wv[f];
        if (val && typeof val === "string" && !val.startsWith("data:") && !val.startsWith("__idb__") && val !== "") {
          try {
            const resp = await fetch(val);
            const blob = await resp.blob();
            const dataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
            wf.updateWidgetValue(n.id, f, dataUrl);
            converted++;
          } catch (e) {
            console.warn(`Failed to convert ${n.id}.${f}:`, e);
          }
        }
      }
    }
    return { converted };
  },

  // Move a node by ID
  moveNode: (nodeId: string, x: number, y: number) => {
    useWorkflowStore.setState({
      nodes: useWorkflowStore.getState().nodes.map((n) =>
        n.id === nodeId ? { ...n, position: { x, y } } : n
      ),
    });
  },

  // Get canvas layout info
  getLayout: () => {
    return useWorkflowStore.getState().nodes.map((n: any) => ({
      id: n.id,
      type: n.data?.type,
      label: n.data?.label,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      w: n.measured?.width || 320,
      h: n.measured?.height || 300,
    }));
  },

  // Get crash logs
  getCrashLogs: () => {
    try {
      return JSON.parse(localStorage.getItem("flowstudio_crash_logs") || "[]");
    } catch { return []; }
  },
};

// ── Global Error Tracking ────────────────────────────────────────
function logCrash(type: string, error: string, stack?: string) {
  try {
    const logs = JSON.parse(localStorage.getItem("flowstudio_crash_logs") || "[]");
    logs.push({
      time: new Date().toISOString(),
      type,
      error: error.slice(0, 500),
      stack: stack?.slice(0, 1000),
      nodes: useWorkflowStore.getState().nodes.length,
      project: useWorkflowStore.getState().currentProjectName,
    });
    // Keep last 20 crashes
    localStorage.setItem("flowstudio_crash_logs", JSON.stringify(logs.slice(-20)));
  } catch { /* storage may be full */ }
}

// Catch unhandled errors
window.addEventListener("error", (e) => {
  logCrash("error", e.message, e.error?.stack);
  console.error("[CRASH]", e.message, e.error);
});

// Catch unhandled promise rejections
window.addEventListener("unhandledrejection", (e) => {
  logCrash("unhandledrejection", String(e.reason), e.reason?.stack);
  console.error("[CRASH] Unhandled promise:", e.reason);
});

// React Error Boundary
import { Component, type ReactNode, type ErrorInfo } from "react";

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logCrash("react", error.message, info.componentStack || error.stack);
    console.error("[CRASH] React:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: "#ff6060", background: "#0d0d12", minHeight: "100vh", fontFamily: "sans-serif" }}>
          <h2>FlowStudio crashed</h2>
          <p style={{ color: "#aaa" }}>{this.state.error}</p>
          <p style={{ color: "#888", fontSize: 13 }}>Your project was auto-saved. Reload to recover.</p>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, padding: "8px 24px", background: "#5b9bd5", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 }}
          >
            Reload
          </button>
          <p style={{ color: "#555", fontSize: 11, marginTop: 16 }}>
            Check crash logs: open console (F12) → <code>__debug.getCrashLogs()</code>
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
