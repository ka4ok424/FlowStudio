import { useEffect, useCallback, useRef, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useWorkflowStore } from "./store/workflowStore";
import { fetchNodeDefs, connectWebSocket } from "./api/comfyApi";
import ComfyNode from "./nodes/ComfyNode";
import PromptNode from "./nodes/PromptNode";
import ImportNode from "./nodes/ImportNode";
import NanoBananaNode from "./nodes/NanoBananaNode";
import LocalGenerateNode from "./nodes/LocalGenerateNode";
import NodeLibrary from "./components/NodeLibrary";
import Toolbar from "./components/Toolbar";
import PropertiesPanel from "./components/PropertiesPanel";
import AlignmentGuidesOverlay, { useSnappingNodes } from "./components/AlignmentGuides";
import "./styles/theme.css";

const nodeTypes = {
  comfyNode: ComfyNode,
  promptNode: PromptNode,
  importNode: ImportNode,
  nanoBananaNode: NanoBananaNode,
  localGenerateNode: LocalGenerateNode,
};

function App() {
  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    setNodeDefs, addNode, setConnected, setProgress,
    saveWorkflow, loadWorkflow,
    pushUndo, undo, redo,
    setConnecting, setSelectedNode, selectedNodeId,
  } = useWorkflowStore();

  const { guides, wrapNodesChange } = useSnappingNodes();

  // Wrap onNodesChange with snap logic
  const wrappedOnNodesChange = useMemo(
    () => wrapNodesChange(onNodesChange, nodes),
    [wrapNodesChange, onNodesChange, nodes]
  );

  // Load node defs + restore saved workflow
  useEffect(() => {
    fetchNodeDefs()
      .then((defs) => {
        setNodeDefs(defs);
        setConnected(true);
        console.log(`Loaded ${Object.keys(defs).length} node definitions`);
        loadWorkflow();
      })
      .catch((err) => {
        console.error("Failed to connect to ComfyUI:", err);
        setConnected(false);
      });
  }, [setNodeDefs, setConnected, loadWorkflow]);

  // Autosave (debounced)
  useEffect(() => {
    if (nodes.length === 0) return;
    const timer = setTimeout(() => saveWorkflow(), 1000);
    return () => clearTimeout(timer);
  }, [nodes, edges, saveWorkflow]);

  // Log helper
  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev.slice(-200), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);


  // WebSocket
  useEffect(() => {
    const ws = connectWebSocket((data) => {
      if (data.type === "progress") {
        setProgress({ value: data.data.value, max: data.data.max });
        addLog(`Progress: ${data.data.value}/${data.data.max}`);
      } else if (data.type === "executing" && data.data.node === null) {
        setProgress(null);
        addLog("Execution complete");
      } else if (data.type === "executing") {
        addLog(`Executing node: ${data.data.node}`);
      }
    });
    return () => ws.close();
  }, [setProgress, addLog]);

  // React Flow helpers
  const { screenToFlowPosition, getViewport } = useReactFlow();

  const getViewportCenter = useCallback(() => {
    const { x, y, zoom } = getViewport();
    return {
      x: (-x + window.innerWidth / 2) / zoom,
      y: (-y + window.innerHeight / 2) / zoom,
    };
  }, [getViewport]);

  // Keyboard shortcuts: Copy/Paste/Undo/Redo
  const clipboard = useRef<{ nodes: any[]; edges: any[]; bounds: { cx: number; cy: number } } | null>(null);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Undo: Ctrl+Z
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      // Redo: Ctrl+Shift+Z
      if (mod && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }

      // Copy
      if (mod && e.key === "c") {
        const selected = nodes.filter(n => n.selected);
        if (selected.length === 0) return;

        const selectedIds = new Set(selected.map(n => n.id));

        // Save nodes with relative positions
        const copiedNodes = selected.map(n => ({
          originalId: n.id,
          type: n.data.type,
          position: { ...n.position },
          data: { ...n.data, widgetValues: { ...n.data.widgetValues } },
        }));

        // Save edges between selected nodes only
        const copiedEdges = edges.filter(
          e => selectedIds.has(e.source) && selectedIds.has(e.target)
        ).map(e => ({ ...e }));

        // Calculate center of selection
        const cx = selected.reduce((s, n) => s + n.position.x, 0) / selected.length;
        const cy = selected.reduce((s, n) => s + n.position.y, 0) / selected.length;

        clipboard.current = { nodes: copiedNodes, edges: copiedEdges, bounds: { cx, cy } };
      }

      // Paste
      if (mod && e.key === "v") {
        if (!clipboard.current || clipboard.current.nodes.length === 0) return;
        e.preventDefault();
        pushUndo();

        const center = getViewportCenter();
        const { nodes: copiedNodes, edges: copiedEdges, bounds } = clipboard.current;

        // Map old IDs to new IDs
        const idMap = new Map<string, string>();

        // Create new nodes with offset from center
        for (const item of copiedNodes) {
          const offsetX = item.position.x - bounds.cx;
          const offsetY = item.position.y - bounds.cy;

          addNode(item.type, {
            x: center.x + offsetX + 30,
            y: center.y + offsetY + 30,
          });

          // Get the newly created node and apply widget values
          const state = useWorkflowStore.getState();
          const newNode = state.nodes[state.nodes.length - 1];
          if (newNode) {
            idMap.set(item.originalId, newNode.id);
            useWorkflowStore.setState({
              nodes: state.nodes.map(n =>
                n.id === newNode.id
                  ? { ...n, data: { ...n.data, widgetValues: { ...item.data.widgetValues } } }
                  : n
              ),
            });
          }
        }

        // Select only pasted nodes, deselect others
        const newIds = new Set(idMap.values());
        const stateAfter = useWorkflowStore.getState();
        useWorkflowStore.setState({
          nodes: stateAfter.nodes.map(n => ({ ...n, selected: newIds.has(n.id) })),
        });

        // Recreate edges with new IDs
        if (copiedEdges.length > 0) {
          const state = useWorkflowStore.getState();
          const newEdges = copiedEdges
            .filter(e => idMap.has(e.source) && idMap.has(e.target))
            .map(e => ({
              ...e,
              id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              source: idMap.get(e.source)!,
              target: idMap.get(e.target)!,
            }));

          useWorkflowStore.setState({
            edges: [...state.edges, ...newEdges],
          });
        }
      }

      // Delete
      if (e.key === "Delete" || e.key === "Backspace") {
        pushUndo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nodes, addNode, undo, redo, pushUndo, getViewportCenter]);

  // Drop from library

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData("application/comfy-node-type");
      if (!nodeType) return;
      pushUndo();
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      addNode(nodeType, position);
    },
    [addNode, screenToFlowPosition]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // Minimap & Logs toggle
  const [showMinimap, setShowMinimap] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Node click → select for properties panel
  const onNodeClick = useCallback((_: any, node: any) => {
    setSelectedNode(node.id);
  }, [setSelectedNode]);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  // Highlight compatible handles during connection
  const onConnectStart = useCallback((_: any, params: any) => {
    const node = nodes.find(n => n.id === params.nodeId);
    if (!node) return;
    if (params.handleType === "source" && params.handleId) {
      const idx = parseInt(params.handleId.replace("output_", ""));
      setConnecting(node.data.outputs[idx] || null, "source", params.nodeId, params.handleId);
    } else if (params.handleType === "target" && params.handleId) {
      const config = node.data.inputs.required?.[params.handleId] || node.data.inputs.optional?.[params.handleId];
      if (config && Array.isArray(config) && typeof config[0] === "string") {
        setConnecting(config[0], "target", params.nodeId, params.handleId);
      }
    }
  }, [nodes, setConnecting]);

  const onConnectEnd = useCallback(() => {
    setConnecting(null, null);
  }, [setConnecting]);

  return (
    <>
      <Toolbar />
      <div className="main-layout">
        <NodeLibrary />
        <div className="canvas-wrapper" onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={wrappedOnNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            proOptions={{ hideAttribution: true }}
            fitView
            defaultEdgeOptions={{
              type: "default",
              animated: false,
              style: { stroke: "#5b9bd5", strokeWidth: 1 },
            }}
            connectionLineStyle={{ stroke: "#ffffff", strokeWidth: 1 }}
            connectionLineType={"default" as any}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1.5} color="#282835" />
            <AlignmentGuidesOverlay guides={guides} />
            <Controls showInteractive={false} />
            {showMinimap && (
              <MiniMap nodeColor="#2a2a35" maskColor="rgba(0,0,0,0.6)" />
            )}
          </ReactFlow>
          <div className="canvas-bottom-buttons">
            <button className="canvas-btn" onClick={() => setShowLogs(!showLogs)}>Logs</button>
            <button className="canvas-btn" onClick={() => setShowMinimap(!showMinimap)}>Map</button>
          </div>

          {showLogs && (
            <div className="logs-panel">
              <div className="logs-header">
                <span>Logs</span>
                <button onClick={() => setLogs([])}>Clear</button>
              </div>
              <div className="logs-content">
                {logs.length === 0 && <div className="logs-empty">No logs yet</div>}
                {logs.map((log, i) => <div key={i} className="log-line">{log}</div>)}
              </div>
            </div>
          )}
        </div>
        {selectedNodeId && <PropertiesPanel />}
      </div>
    </>
  );
}

// Wrap with ReactFlowProvider so useReactFlow() works
function AppWrapper() {
  return (
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>
  );
}

export default AppWrapper;
