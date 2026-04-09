import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { useWorkflowStore } from "./store/workflowStore";
import { useMediaStore } from "./store/mediaStore";

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
    // Test save cycle: save → load → compare
    const wf = useWorkflowStore.getState();
    const before = wf.nodes.length;
    await wf.saveProject();
    const projData = localStorage.getItem(`flowstudio_proj_${wf.currentProjectId}`);
    if (!projData) return { error: "NO DATA SAVED" };
    const parsed = JSON.parse(projData);
    const saved = parsed.nodes?.length || 0;
    return { before, saved, match: before === saved, projDataSize: projData.length };
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
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
