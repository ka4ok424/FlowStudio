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

const SLOT_COLORS: Record<string, string> = {
  IMAGE: "#64b5f6", LATENT: "#ab47bc", MODEL: "#b39ddb",
  CLIP: "#f0c040", VAE: "#ff7043", CONDITIONING: "#ef9a9a",
  MASK: "#4dd0e1", INT: "#81c784", FLOAT: "#81c784",
  STRING: "#ce93d8", COMBO: "#90a4ae", BOOLEAN: "#e6ee9c",
  CONTROL_NET: "#a1887f", VIDEO: "#e85d75", AUDIO: "#e8a040",
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

  setNodeDefs: (defs) => set({ nodeDefs: defs }),
  setConnecting: (type, direction, nodeId = null, handleId = null) => set({ connectingType: type, connectingDirection: direction, connectingNodeId: nodeId, connectingHandleId: handleId }),

  pushUndo: () => {
    const { nodes, edges, _undoStack } = get();
    const snap: Snapshot = { nodes: structuredClone(nodes), edges: structuredClone(edges) };
    set({ _undoStack: [..._undoStack.slice(-50), snap], _redoStack: [] });
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

  onNodesChange: (changes) =>
    set({ nodes: applyNodeChanges(changes, get().nodes) as Node<ComfyNodeData>[] }),

  onEdgesChange: (changes) =>
    set({ edges: applyEdgeChanges(changes, get().edges) }),

  onConnect: (connection) => {
    get().pushUndo();
    // Determine edge color: use source output type, fallback to target input type
    const sourceNode = get().nodes.find(n => n.id === connection.source);
    const targetNode = get().nodes.find(n => n.id === connection.target);
    let color = "#aaaaaa";

    // Try source output type first
    if (sourceNode && connection.sourceHandle) {
      const idx = parseInt(connection.sourceHandle.replace("output_", ""));
      const outputType = sourceNode.data.outputs[idx];
      if (outputType && SLOT_COLORS[outputType]) {
        color = SLOT_COLORS[outputType];
      }
    }

    // If source was fallback gray, try target input type
    if (color === "#aaaaaa" && targetNode && connection.targetHandle) {
      const inputName = connection.targetHandle;
      const config = targetNode.data.inputs.required?.[inputName] || targetNode.data.inputs.optional?.[inputName];
      if (config && Array.isArray(config) && typeof config[0] === "string" && SLOT_COLORS[config[0]]) {
        color = SLOT_COLORS[config[0]];
      }
    }

    const edge = {
      ...connection,
      style: { stroke: darken(color, 0.4), strokeWidth: 1 },
    };
    set({ edges: addEdge(edge, get().edges) });
  },

  addNode: (type, position) => {
    const def = get().nodeDefs[type];
    if (!def) return;

    const id = `node_${++nodeIdCounter}`;
    const widgetValues: Record<string, any> = {};

    // Set default widget values from required inputs
    if (def.input.required) {
      for (const [key, config] of Object.entries(def.input.required)) {
        if (Array.isArray(config) && Array.isArray(config[0])) {
          widgetValues[key] = config[0][0]; // first option of enum
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
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, widgetValues: { ...n.data.widgetValues, [key]: value } } }
          : n
      ),
    });
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
}));
