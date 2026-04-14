import { create } from "zustand";
import {
  type Edge,
  type Node,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from "@xyflow/react";
import type { ComfyNodeDef } from "../api/comfyApi";
import { getNativeNode } from "../nodes/registry";
import { extractImages, restoreImages, saveImage, saveImageBatch, loadImage, deleteImagesByPrefix, copyImagesByPrefix, markKeyPersisted } from "./imageDb";

export interface ProjectMeta {
  id: string;
  name: string;
  nodeCount: number;
  updatedAt: number;
  createdAt: number;
  thumbnail?: string; // small data URL for project card preview
}

const PROJECTS_INDEX_KEY = "flowstudio_projects";

const SLOT_COLORS: Record<string, string> = {
  IMAGE: "#64b5f6", LATENT: "#ab47bc", MODEL: "#b39ddb",
  CLIP: "#f0c040", VAE: "#ff7043", CONDITIONING: "#ef9a9a",
  MASK: "#4dd0e1", INT: "#81c784", FLOAT: "#81c784",
  STRING: "#ce93d8", COMBO: "#90a4ae", BOOLEAN: "#e6ee9c",
  CONTROL_NET: "#a1887f", VIDEO: "#e85d75", AUDIO: "#e8a040",
  TEXT: "#f0c040", CHARACTER: "#a78bfa", MEDIA: "#888888",
};
export function getSlotColor(type: string): string {
  return SLOT_COLORS[type] || "#aaaaaa";
}

function darken(hex: string, amount = 0.3): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const d = (v: number) => Math.round(v * (1 - amount)).toString(16).padStart(2, "0");
  return `#${d(r)}${d(g)}${d(b)}`;
}

export interface ComfyNodeData {
  label: string;
  type: string;
  category: string;
  inputs: Record<string, any>;
  outputs: string[];
  outputNames: string[];
  widgetValues: Record<string, any>;
  [key: string]: unknown;
}

interface Snapshot {
  nodes: Node<ComfyNodeData>[];
  edges: Edge[];
}

interface WorkflowState {
  nodes: Node<ComfyNodeData>[];
  edges: Edge[];
  nodeDefs: Record<string, ComfyNodeDef>;
  selectedNodeId: string | null;
  isConnected: boolean;
  progress: { value: number; max: number } | null;
  connectingType: string | null;
  connectingDirection: "source" | "target" | null;
  connectingNodeId: string | null;
  connectingHandleId: string | null;
  _undoStack: Snapshot[];
  _redoStack: Snapshot[];

  setNodeDefs: (defs: Record<string, ComfyNodeDef>) => void;
  setConnecting: (type: string | null, direction: "source" | "target" | null, nodeId?: string | null, handleId?: string | null) => void;
  pushUndo: () => void;
  undo: () => void;
  redo: () => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (type: string, position: { x: number; y: number }) => void;
  setSelectedNode: (id: string | null) => void;
  setConnected: (connected: boolean) => void;
  setProgress: (progress: { value: number; max: number } | null) => void;
  updateWidgetValue: (nodeId: string, key: string, value: any) => void;
  buildWorkflow: () => Record<string, any>;
  saveWorkflow: (name?: string) => void;
  loadWorkflow: (name?: string) => void;
  listWorkflows: () => string[];
  deleteWorkflow: (name: string) => void;

  // Project management
  currentProjectId: string | null;
  currentProjectName: string;
  setCurrentProjectName: (name: string) => void;
  saveProject: (updateThumbnail?: boolean) => Promise<void>;
  loadProject: (id: string) => Promise<void>;
  createProject: (name: string) => Promise<string>;
  deleteProject: (id: string) => Promise<void>;
  cloneProject: (id: string) => Promise<string>;
  renameProject: (id: string, name: string) => void;
  listProjects: () => ProjectMeta[];

  // Chat history (per project)
  chatMessages: { role: "user" | "assistant"; content: string }[];
  setChatMessages: (msgs: { role: "user" | "assistant"; content: string }[]) => void;
  addChatMessage: (msg: { role: "user" | "assistant"; content: string }) => void;
  clearChat: () => void;

  // Dirty tracking (prevents pointless autosaves)
  _dirty: boolean;
  _dirtyMedia: boolean;
  _markDirty: (media?: boolean) => void;
}

let nodeIdCounter = 0;

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  nodeDefs: {},
  selectedNodeId: null,
  isConnected: false,
  progress: null,
  connectingType: null,
  connectingDirection: null,
  connectingNodeId: null,
  connectingHandleId: null,
  _undoStack: [],
  _redoStack: [],

  _dirty: false,
  _dirtyMedia: false,
  _markDirty: (media = false) => set({ _dirty: true, ...(media ? { _dirtyMedia: true } : {}) }),

  setNodeDefs: (defs) => set({ nodeDefs: defs }),
  setConnecting: (type, direction, nodeId = null, handleId = null) => set({ connectingType: type, connectingDirection: direction, connectingNodeId: nodeId, connectingHandleId: handleId }),

  pushUndo: () => {
    const { nodes, edges, _undoStack } = get();
    // Lightweight snapshot: share heavy data (images) by reference, only clone structure
    const lightNodes = nodes.map((n) => ({
      ...n,
      position: { ...n.position },
      data: {
        ...n.data,
        // Share widgetValues by reference — don't deep clone data URLs
        widgetValues: n.data.widgetValues,
      },
    }));
    const snap: Snapshot = { nodes: lightNodes as any, edges: [...edges] };
    set({ _undoStack: [..._undoStack.slice(-20), snap], _redoStack: [] });
  },

  undo: () => {
    const { nodes, edges, _undoStack } = get();
    if (_undoStack.length === 0) return;
    const prev = _undoStack[_undoStack.length - 1];
    const currentSnap: Snapshot = { nodes: structuredClone(nodes), edges: structuredClone(edges) };
    set({
      nodes: prev.nodes,
      edges: prev.edges,
      _undoStack: _undoStack.slice(0, -1),
      _redoStack: [...get()._redoStack, currentSnap],
    });
  },

  redo: () => {
    const { nodes, edges, _redoStack } = get();
    if (_redoStack.length === 0) return;
    const next = _redoStack[_redoStack.length - 1];
    const currentSnap: Snapshot = { nodes: structuredClone(nodes), edges: structuredClone(edges) };
    set({
      nodes: next.nodes,
      edges: next.edges,
      _redoStack: _redoStack.slice(0, -1),
      _undoStack: [...get()._undoStack, currentSnap],
    });
  },

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) as Node<ComfyNodeData>[] });
    // Only mark dirty for meaningful changes (not select/dimensions)
    if (changes.some(c => c.type === "position" || c.type === "remove" || c.type === "add" || c.type === "replace")) {
      set({ _dirty: true });
    }
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
    set({ _dirty: true });
  },

  onConnect: (connection) => {
    const sourceNode = get().nodes.find(n => n.id === connection.source);
    const targetNode = get().nodes.find(n => n.id === connection.target);

    // ── Resolve source output type ──
    let sourceType = "*";
    if (sourceNode && connection.sourceHandle) {
      if (sourceNode.data._native) {
        // Native nodes: handle IDs are like "character_out", "portrait_out", "output_0"
        const handle = connection.sourceHandle;
        const idx = parseInt(handle.replace("output_", ""));
        if (!isNaN(idx) && sourceNode.data.outputs[idx]) {
          sourceType = sourceNode.data.outputs[idx];
        } else {
          // Look up from registry
          const nativeDef = getNativeNode(sourceNode.data.type);
          if (nativeDef) {
            const out = nativeDef.outputs.find(o => handle.includes(o.name.replace(/\s+/g, "_").toLowerCase()) || handle === `${o.name.replace(/\s+/g, "_").toLowerCase()}_out`);
            if (out) sourceType = out.type;
          }
        }
      } else {
        const idx = parseInt(connection.sourceHandle.replace("output_", ""));
        if (!isNaN(idx) && sourceNode.data.outputs[idx]) {
          sourceType = sourceNode.data.outputs[idx];
        }
      }
    }

    // ── Resolve target input type ──
    let targetType = "*";
    if (targetNode && connection.targetHandle) {
      if (targetNode.data._native && targetNode.data._nativeInputs) {
        // Native node: check _nativeInputs map
        const handle = connection.targetHandle;
        // Direct match
        if (targetNode.data._nativeInputs[handle]) {
          targetType = targetNode.data._nativeInputs[handle];
        } else {
          // Dynamic handles like character_0, character_1 → match base name "character_0" from registry
          const nativeDef = getNativeNode(targetNode.data.type);
          if (nativeDef) {
            // Try to match pattern: character_0 → find input starting with "character_"
            const baseInput = nativeDef.inputs.find(i => handle.startsWith(i.name.replace(/_\d+$/, "")));
            if (baseInput) targetType = baseInput.type;
          }
        }
      } else if (targetNode.data.inputs) {
        // ComfyUI node
        const config = targetNode.data.inputs.required?.[connection.targetHandle] || targetNode.data.inputs.optional?.[connection.targetHandle];
        if (config && Array.isArray(config) && typeof config[0] === "string") {
          targetType = config[0];
        }
      }
    }

    // ── Type compatibility check ──
    const compatible = (src: string, tgt: string) => {
      if (src === "*" || tgt === "*") return true;
      if (src === tgt) return true;
      // MEDIA accepts IMAGE, VIDEO, AUDIO
      if (tgt === "MEDIA" && ["IMAGE", "VIDEO", "AUDIO"].includes(src)) return true;
      if (src === "MEDIA" && ["IMAGE", "VIDEO", "AUDIO"].includes(tgt)) return true;
      // TEXT and STRING are interchangeable
      if ((src === "TEXT" || src === "STRING") && (tgt === "TEXT" || tgt === "STRING")) return true;
      return false;
    };

    if (!compatible(sourceType, targetType)) {
      console.warn(`[Connect] Blocked: ${sourceType} → ${targetType}`);
      return; // Block incompatible connection
    }

    get().pushUndo();

    // Determine edge color
    const color = SLOT_COLORS[sourceType] || SLOT_COLORS[targetType] || "#aaaaaa";

    const edge = {
      ...connection,
      style: { stroke: darken(color, 0.4), strokeWidth: 1 },
    };
    set({ edges: addEdge(edge, get().edges), _dirty: true });
  },

  addNode: (type, position) => {
    const id = `node_${++nodeIdCounter}`;

    // ── Native FlowStudio node ───────────────────────────────
    const nativeDef = getNativeNode(type);
    if (nativeDef) {
      const componentMap: Record<string, string> = {
        PromptNode: "promptNode",
        ImportNode: "importNode",
        NanoBananaNode: "nanoBananaNode",
        LocalGenerateNode: "localGenerateNode",
        PreviewNode: "previewNode",
        CharacterCardNode: "characterCardNode",
        SceneNode: "sceneNode",
        StoryboardNode: "storyboardNode",
        VideoGenNode: "videoGenNode",
        ImagenNode: "imagenNode",
        MusicNode: "musicNode",
        TtsNode: "ttsNode",
        MultiRefNode: "multiRefNode",
        VideoGenProNode: "videoGenProNode",
        TikTokPublishNode: "tikTokPublishNode",
        UpscaleNode: "upscaleNode",
        GroupNode: "groupNode",
        CommentNode: "commentNode",
        Img2ImgNode: "img2ImgNode",
        KontextNode: "kontextNode",
        LtxVideoNode: "ltxVideoNode",
        NextFrameNode: "nextFrameNode",
        RemoveBgNode: "removeBgNode",
        InpaintNode: "inpaintNode",
        CompareNode: "compareNode",
        EnhanceNode: "enhanceNode",
        ControlNetNode: "controlNetNode",
        InpaintCNNode: "inpaintCNNode",
      };
      const isGroup = nativeDef.type === "fs:group";
      const newNode: Node<ComfyNodeData> = {
        id,
        type: componentMap[nativeDef.component] || "comfyNode",
        position,
        ...(isGroup ? {
          style: { width: 800, height: 400 },
          zIndex: -1,
        } : {}),
        data: {
          label: nativeDef.label,
          type: nativeDef.type,
          category: "native",
          inputs: {},
          outputs: nativeDef.outputs.map((o) => o.type),
          outputNames: nativeDef.outputs.map((o) => o.name),
          widgetValues: nativeDef.type === "fs:localGenerate" ? { model: "flux-2-klein-9b.safetensors" } : {},
          _native: true,
          _nativeInputs: Object.fromEntries(nativeDef.inputs.map((i) => [i.name, i.type])),
        },
      };
      set({ nodes: [...get().nodes, newNode], _dirty: true });
      return;
    }

    // ── ComfyUI node ─────────────────────────────────────────
    const def = get().nodeDefs[type];
    if (!def) return;

    const widgetValues: Record<string, any> = {};
    if (def.input.required) {
      for (const [key, config] of Object.entries(def.input.required)) {
        if (Array.isArray(config) && Array.isArray(config[0])) {
          widgetValues[key] = config[0][0];
        } else if (Array.isArray(config) && config.length > 1 && typeof config[1] === "object") {
          widgetValues[key] = config[1].default ?? "";
        }
      }
    }

    const newNode: Node<ComfyNodeData> = {
      id,
      type: "comfyNode",
      position,
      data: {
        label: def.display_name || type,
        type,
        category: def.category,
        inputs: def.input,
        outputs: def.output || [],
        outputNames: def.output_name || def.output || [],
        widgetValues,
      },
    };

    set({ nodes: [...get().nodes, newNode] });
  },

  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setConnected: (connected) => set({ isConnected: connected }),
  setProgress: (progress) => set({ progress }),

  updateWidgetValue: (nodeId, key, value) => {
    const MEDIA_KEYS = ["_previewUrl", "portraitUrl", "_preview", "_history", "_historyIndex"];
    const isMedia = MEDIA_KEYS.includes(key);
    const nodes = get().nodes.map((n) =>
      n.id === nodeId
        ? { ...n, data: { ...n.data, widgetValues: { ...n.data.widgetValues, [key]: value } } }
        : n
    );
    set({ nodes, _dirty: true, ...(isMedia ? { _dirtyMedia: true } : {}) });

    // When media type changes on Import node, validate edges
    if (key === "_mediaType") {
      const TYPE_MAP: Record<string, string> = { image: "IMAGE", video: "VIDEO", audio: "AUDIO" };
      const newType = TYPE_MAP[value as string];
      if (!newType) return;

      const edges = get().edges.map((edge) => {
        if (edge.source !== nodeId) return edge;
        // Check if target accepts this type
        const targetNode = nodes.find((n) => n.id === edge.target);
        if (!targetNode || !edge.targetHandle) return edge;

        const inputs = targetNode.data.inputs;
        const config = inputs?.required?.[edge.targetHandle] || inputs?.optional?.[edge.targetHandle];
        const acceptedType = config?.[0];

        // Native nodes: check by handle ID
        const isNative = (targetNode.data as any)._native;
        let compatible = true;
        if (isNative) {
          // fs:nanoBanana accepts IMAGE on input_image/ref_*, TEXT on prompt
          if (edge.targetHandle === "prompt" && newType !== "TEXT") compatible = false;
          if ((edge.targetHandle === "input_image" || edge.targetHandle?.startsWith("ref_")) && newType !== "IMAGE") compatible = false;
        } else if (acceptedType && acceptedType !== "*" && acceptedType !== newType) {
          compatible = false;
        }

        if (!compatible) {
          return { ...edge, style: { ...edge.style, stroke: "#ff2020", strokeWidth: 3 }, className: "edge-error", data: { error: true } };
        }
        // Restore normal color
        const color = getSlotColor(newType);
        return { ...edge, style: { ...edge.style, stroke: darken(color, 0.4), strokeWidth: 1 }, className: "", data: { error: false } };
      });
      set({ edges });
    }
  },

  // Build ComfyUI-compatible workflow JSON
  buildWorkflow: () => {
    const { nodes, edges } = get();
    const workflow: Record<string, any> = {};

    for (const node of nodes) {
      const inputs: Record<string, any> = { ...node.data.widgetValues };

      // Resolve connections
      for (const edge of edges) {
        if (edge.target === node.id && edge.targetHandle) {
          const sourceNode = nodes.find((n) => n.id === edge.source);
          if (sourceNode && edge.sourceHandle) {
            const outputIndex = parseInt(edge.sourceHandle.replace("output_", ""));
            inputs[edge.targetHandle] = [edge.source, outputIndex];
          }
        }
      }

      workflow[node.id] = {
        class_type: node.data.type,
        inputs,
      };
    }

    return workflow;
  },

  saveWorkflow: (name = "_autosave") => {
    const { nodes, edges } = get();
    const data = JSON.stringify({ nodes, edges, savedAt: Date.now() });
    localStorage.setItem(`flowstudio_wf_${name}`, data);

    // Track workflow names
    const list = JSON.parse(localStorage.getItem("flowstudio_wf_list") || "[]") as string[];
    if (!list.includes(name)) {
      list.push(name);
      localStorage.setItem("flowstudio_wf_list", JSON.stringify(list));
    }
  },

  loadWorkflow: (name = "_autosave") => {
    const raw = localStorage.getItem(`flowstudio_wf_${name}`);
    if (!raw) return;
    try {
      const { nodes, edges } = JSON.parse(raw);
      if (nodes) {
        // Restore nodeIdCounter to avoid ID collisions
        const maxId = nodes.reduce((max: number, n: any) => {
          const num = parseInt(n.id?.replace("node_", "") || "0");
          return Math.max(max, num);
        }, 0);
        nodeIdCounter = maxId;
        set({ nodes, edges: edges || [] });
      }
    } catch { /* ignore corrupt data */ }
  },

  listWorkflows: () => {
    return JSON.parse(localStorage.getItem("flowstudio_wf_list") || "[]") as string[];
  },

  deleteWorkflow: (name) => {
    localStorage.removeItem(`flowstudio_wf_${name}`);
    const list = JSON.parse(localStorage.getItem("flowstudio_wf_list") || "[]") as string[];
    localStorage.setItem("flowstudio_wf_list", JSON.stringify(list.filter(n => n !== name)));
  },

  // ── Project Management ────────────────────────────────────────
  currentProjectId: null,
  currentProjectName: "Untitled",

  setCurrentProjectName: (name) => {
    set({ currentProjectName: name });
    const { currentProjectId } = get();
    if (currentProjectId) {
      const index = JSON.parse(localStorage.getItem(PROJECTS_INDEX_KEY) || "[]") as ProjectMeta[];
      const updated = index.map((p) => p.id === currentProjectId ? { ...p, name } : p);
      localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(updated));
    }
  },

  _saving: false,
  saveProject: async (updateThumbnail = false) => {
    if ((get() as any)._saving) return; // prevent concurrent saves
    (set as any)({ _saving: true });
    try {
    let { currentProjectId, currentProjectName, nodes, edges } = get();
    if (!currentProjectId) {
      currentProjectId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      set({ currentProjectId });
    }

    // ── Protection: don't overwrite with empty project ──
    const prevData = await loadImage(`project_${currentProjectId}`);
    if (nodes.length === 0 && prevData) {
      try {
        const prev = JSON.parse(prevData);
        if (prev.nodes && prev.nodes.length >= 3) {
          console.warn(`[SaveProject] BLOCKED: 0 nodes would overwrite ${prev.nodes.length} nodes. Skipping save.`);
          return;
        }
      } catch { /* ignore parse error */ }
    }

    // Extract images → IndexedDB (incremental — skips already-persisted)
    const { strippedNodes, images } = await extractImages(currentProjectId, nodes as any[]);
    if (images.size > 0) {
      await saveImageBatch(images);
    }

    const wfData = JSON.stringify({ nodes: strippedNodes, edges });
    const wfSizeMB = (wfData.length / 1024 / 1024).toFixed(2);
    console.log(`[SaveProject] Data size: ${wfSizeMB} MB, images: ${images.size}`);

    // ── Auto-backup rotation (keep last 10) ──
    const MAX_BACKUPS = 10;
    const backupKey = `project_${currentProjectId}_bk_${Date.now()}`;
    await saveImage(backupKey, wfData);
    // Clean old backups
    try {
      const dbReq = indexedDB.open("flowstudio_images");
      const db: IDBDatabase = await new Promise((r) => { dbReq.onsuccess = () => r(dbReq.result); });
      const tx = db.transaction("images", "readwrite");
      const store = tx.objectStore("images");
      const allKeys: string[] = await new Promise((r) => { const req = store.getAllKeys(); req.onsuccess = () => r(req.result as string[]); });
      const bkPrefix = `project_${currentProjectId}_bk_`;
      const backupKeys = allKeys.filter((k) => k.startsWith(bkPrefix)).sort();
      if (backupKeys.length > MAX_BACKUPS) {
        for (const old of backupKeys.slice(0, backupKeys.length - MAX_BACKUPS)) {
          store.delete(old);
        }
      }
      db.close();
    } catch { /* ignore cleanup errors */ }

    // Save workflow to IndexedDB
    await saveImage(`project_${currentProjectId}`, wfData);
    await saveImage(`project_${currentProjectId}_backup`, wfData);

    // ── localStorage fallback (defense-in-depth) ──
    // Always keep a copy of project structure in localStorage.
    // IndexedDB can silently stop writing to disk (Chrome best-effort storage).
    try {
      localStorage.setItem(`flowstudio_ls_${currentProjectId}`, wfData);
    } catch {
      // localStorage full — try to trim: remove oldest ls_ entries
      const lsKeys = Object.keys(localStorage).filter(k => k.startsWith("flowstudio_ls_") && k !== `flowstudio_ls_${currentProjectId}`);
      for (const k of lsKeys) { localStorage.removeItem(k); }
      try { localStorage.setItem(`flowstudio_ls_${currentProjectId}`, wfData); } catch { /* truly full */ }
    }

    // ── Read-back verification ──
    // Verify IDB actually persisted (detect cache-only mode)
    try {
      const readBack = await loadImage(`project_${currentProjectId}`);
      if (!readBack) {
        console.error("[SaveProject] READ-BACK FAILED: IDB write succeeded but read returned null!");
        // IDB is broken — localStorage fallback is our safety net
      }
    } catch (verifyErr: any) {
      console.error("[SaveProject] READ-BACK ERROR:", verifyErr.message);
      // Show warning to user if IDB is dead
      if (!document.querySelector(".idb-warning-banner")) {
        const banner = document.createElement("div");
        banner.className = "idb-warning-banner";
        banner.innerHTML = "Storage warning: project saved to backup only. Export your project as a safety measure.";
        banner.style.cssText = "position:fixed;top:0;left:0;right:0;padding:8px 16px;background:#b71c1c;color:white;font-size:13px;font-weight:600;z-index:99999;text-align:center;";
        document.body.prepend(banner);
      }
    }

    // Find a thumbnail — only on manual save (Cmd+S), not autosave
    let thumbnail: string | undefined;
    if (!updateThumbnail) {
      // Keep existing thumbnail
      const index = JSON.parse(localStorage.getItem(PROJECTS_INDEX_KEY) || "[]") as ProjectMeta[];
      thumbnail = index.find((p) => p.id === currentProjectId)?.thumbnail;
    }
    // Pick the node with most recent generation (highest _genTime timestamp)
    if (updateThumbnail) {
    let bestUrl: string | undefined;
    let bestTime = 0;
    for (const n of nodes as any[]) {
      const wv = n.data?.widgetValues;
      if (!wv) continue;
      const url = wv._previewUrl || wv.portraitUrl || wv._preview;
      const t = wv._genTime || 0;
      if (url && typeof url === "string" && url.startsWith("data:image") && t >= bestTime) {
        bestUrl = url;
        bestTime = t;
      }
    }
    if (bestUrl) {
      const url = bestUrl;
      if (url) {
        try {
          // Resize to small thumbnail via canvas
          thumbnail = await new Promise<string | undefined>((resolve) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement("canvas");
              const tw = 280, th = 180;
              canvas.width = tw; canvas.height = th;
              const ctx = canvas.getContext("2d");
              if (ctx) {
                // object-fit: cover — crop to fill, preserve aspect ratio
                const scale = Math.max(tw / img.width, th / img.height);
                const sw = tw / scale, sh = th / scale;
                const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);
                resolve(canvas.toDataURL("image/jpeg", 0.8));
              } else {
                resolve(undefined);
              }
            };
            img.onerror = () => resolve(undefined);
            img.src = url;
            setTimeout(() => resolve(undefined), 1000);
          });
        } catch { /* ignore */ }
      }
    }
    } // end updateThumbnail

    // Update index
    const index = JSON.parse(localStorage.getItem(PROJECTS_INDEX_KEY) || "[]") as ProjectMeta[];
    const existing = index.findIndex((p) => p.id === currentProjectId);
    const meta: ProjectMeta = {
      id: currentProjectId,
      name: currentProjectName,
      nodeCount: nodes.length,
      updatedAt: Date.now(),
      createdAt: existing >= 0 ? index[existing].createdAt : Date.now(),
      thumbnail: thumbnail || (existing >= 0 ? index[existing].thumbnail : undefined),
    };
    if (existing >= 0) {
      index[existing] = meta;
    } else {
      index.push(meta);
    }
    localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(index));
    localStorage.setItem("flowstudio_current_project", currentProjectId);

    // Save chat history
    const chatMsgs = get().chatMessages;
    if (chatMsgs.length > 0) {
      localStorage.setItem(`flowstudio_chat_${currentProjectId}`, JSON.stringify(chatMsgs));
    }
    } finally {
      (set as any)({ _saving: false, _dirty: false, _dirtyMedia: false });
    }
  },

  loadProject: async (id) => {
    // Save current project first
    if (get().currentProjectId && get().nodes.length > 0) {
      await get().saveProject();
    }

    // Load from IndexedDB, fallback to localStorage backup
    let raw: string | null = null;
    try {
      raw = await loadImage(`project_${id}`);
    } catch {
      console.warn(`[LoadProject] IDB read failed for ${id}, trying localStorage fallback`);
    }
    if (!raw) {
      // Fallback 1: localStorage defense-in-depth copy
      raw = localStorage.getItem(`flowstudio_ls_${id}`);
      if (raw) console.log(`[LoadProject] Recovered from localStorage fallback!`);
    }
    if (!raw) {
      // Fallback 2: old migration format
      raw = localStorage.getItem(`flowstudio_proj_${id}`);
    }
    if (!raw) return;

    try {
      const { nodes: rawNodes, edges } = JSON.parse(raw);
      if (!rawNodes) return;

      // Restore images from IndexedDB (gracefully — images may be lost but structure survives)
      let nodes: any[];
      try {
        nodes = await restoreImages(rawNodes);
      } catch {
        console.warn(`[LoadProject] Image restore failed, loading without images`);
        nodes = rawNodes;
      }

      const maxId = nodes.reduce((max: number, n: any) => {
        const num = parseInt(n.id?.replace("node_", "") || "0");
        return Math.max(max, num);
      }, 0);
      nodeIdCounter = maxId;

      const index = JSON.parse(localStorage.getItem(PROJECTS_INDEX_KEY) || "[]") as ProjectMeta[];
      const meta = index.find((p) => p.id === id);

      // Load chat history
      let chatMessages: any[] = [];
      try {
        const chatRaw = localStorage.getItem(`flowstudio_chat_${id}`);
        if (chatRaw) chatMessages = JSON.parse(chatRaw);
      } catch { /* ignore */ }

      set({
        nodes,
        edges: edges || [],
        currentProjectId: id,
        currentProjectName: meta?.name || "Untitled",
        chatMessages,
        _undoStack: [],
        _redoStack: [],
        selectedNodeId: null,
      });
      localStorage.setItem("flowstudio_current_project", id);
    } catch { /* ignore corrupt data */ }
  },

  createProject: async (name) => {
    // Save current first
    if (get().currentProjectId && get().nodes.length > 0) {
      await get().saveProject();
    }

    const id = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const meta: ProjectMeta = {
      id,
      name,
      nodeCount: 0,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    };
    const index = JSON.parse(localStorage.getItem(PROJECTS_INDEX_KEY) || "[]") as ProjectMeta[];
    index.push(meta);
    localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(index));
    await saveImage(`project_${id}`, JSON.stringify({ nodes: [], edges: [] }));
    localStorage.setItem("flowstudio_current_project", id);

    set({
      nodes: [],
      edges: [],
      currentProjectId: id,
      currentProjectName: name,
      _undoStack: [],
      _redoStack: [],
      selectedNodeId: null,
    });
    return id;
  },

  deleteProject: async (id) => {
    localStorage.removeItem(`flowstudio_proj_${id}`);
    localStorage.removeItem(`flowstudio_proj_${id}_backup`);
    await deleteImagesByPrefix(`${id}/`);
    // Delete main project data but KEEP backups (project_xxx_bk_*)
    await saveImage(`project_${id}`, ""); // clear main
    await saveImage(`project_${id}_backup`, ""); // clear backup
    // Backups (project_xxx_bk_*) are intentionally preserved

    const index = JSON.parse(localStorage.getItem(PROJECTS_INDEX_KEY) || "[]") as ProjectMeta[];
    localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(index.filter((p) => p.id !== id)));

    // If deleting current project, switch to another or create new
    if (get().currentProjectId === id) {
      const remaining = index.filter((p) => p.id !== id);
      if (remaining.length > 0) {
        await get().loadProject(remaining[0].id);
      } else {
        await get().createProject("Untitled");
      }
    }
  },

  cloneProject: async (id) => {
    let raw = await loadImage(`project_${id}`);
    if (!raw) raw = localStorage.getItem(`flowstudio_proj_${id}`);
    if (!raw) return "";

    const index = JSON.parse(localStorage.getItem(PROJECTS_INDEX_KEY) || "[]") as ProjectMeta[];
    const src = index.find((p) => p.id === id);
    const newId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newName = `Clone-${src?.name || "Untitled"}`;

    // Copy workflow data (replace old ID references in image placeholders)
    const newData = raw.replaceAll(id, newId);
    await saveImage(`project_${newId}`, newData);

    // Copy images in IndexedDB
    await copyImagesByPrefix(`${id}/`, `${newId}/`);

    const meta: ProjectMeta = {
      id: newId,
      name: newName,
      nodeCount: src?.nodeCount || 0,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    };
    index.push(meta);
    localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(index));
    return newId;
  },

  renameProject: (id, name) => {
    const index = JSON.parse(localStorage.getItem(PROJECTS_INDEX_KEY) || "[]") as ProjectMeta[];
    const updated = index.map((p) => p.id === id ? { ...p, name } : p);
    localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(updated));
    if (get().currentProjectId === id) {
      set({ currentProjectName: name });
    }
  },

  listProjects: () => {
    return JSON.parse(localStorage.getItem(PROJECTS_INDEX_KEY) || "[]") as ProjectMeta[];
  },

  // ── Chat History ──────────────────────────────────────────────
  chatMessages: [],

  setChatMessages: (msgs) => set({ chatMessages: msgs }),

  addChatMessage: (msg) => {
    const msgs = [...get().chatMessages, msg];
    set({ chatMessages: msgs });
    // Auto-persist to localStorage
    const pid = get().currentProjectId;
    if (pid) {
      localStorage.setItem(`flowstudio_chat_${pid}`, JSON.stringify(msgs));
    }
  },

  clearChat: () => {
    set({ chatMessages: [] });
    const pid = get().currentProjectId;
    if (pid) {
      localStorage.removeItem(`flowstudio_chat_${pid}`);
    }
  },
}));
