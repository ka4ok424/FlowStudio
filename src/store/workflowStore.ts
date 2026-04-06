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

interface WorkflowState {
  nodes: Node<ComfyNodeData>[];
  edges: Edge[];
  nodeDefs: Record<string, ComfyNodeDef>;
  selectedNodeId: string | null;
  isConnected: boolean;
  progress: { value: number; max: number } | null;

  setNodeDefs: (defs: Record<string, ComfyNodeDef>) => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (type: string, position: { x: number; y: number }) => void;
  setSelectedNode: (id: string | null) => void;
  setConnected: (connected: boolean) => void;
  setProgress: (progress: { value: number; max: number } | null) => void;
  updateWidgetValue: (nodeId: string, key: string, value: any) => void;
  buildWorkflow: () => Record<string, any>;
}

let nodeIdCounter = 0;

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  nodeDefs: {},
  selectedNodeId: null,
  isConnected: false,
  progress: null,

  setNodeDefs: (defs) => set({ nodeDefs: defs }),

  onNodesChange: (changes) =>
    set({ nodes: applyNodeChanges(changes, get().nodes) as Node<ComfyNodeData>[] }),

  onEdgesChange: (changes) =>
    set({ edges: applyEdgeChanges(changes, get().edges) }),

  onConnect: (connection) =>
    set({ edges: addEdge(connection, get().edges) }),

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
}));
