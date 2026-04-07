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
import NodeLibrary from "./components/NodeLibrary";
import Toolbar from "./components/Toolbar";
import AlignmentGuidesOverlay, { useSnappingNodes } from "./components/AlignmentGuides";
import "./styles/theme.css";

const nodeTypes = { comfyNode: ComfyNode };

function App() {
  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    setNodeDefs, addNode, setConnected, setProgress,
    saveWorkflow, loadWorkflow,
    pushUndo, undo, redo,
    setConnecting,
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

  // WebSocket
  useEffect(() => {
    const ws = connectWebSocket((data) => {
      if (data.type === "progress") {
        setProgress({ value: data.data.value, max: data.data.max });
      } else if (data.type === "executing" && data.data.node === null) {
        setProgress(null);
      }
    });
    return () => ws.close();
  }, [setProgress]);

  // Keyboard shortcuts: Copy/Paste/Undo/Redo
  const clipboard = useRef<any[]>([]);
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
        if (selected.length > 0) {
          clipboard.current = selected.map(n => ({
            type: n.data.type,
            data: { ...n.data, widgetValues: { ...n.data.widgetValues } },
          }));
        }
      }
      // Paste
      if (mod && e.key === "v") {
        if (clipboard.current.length === 0) return;
        e.preventDefault();
        pushUndo();
        clipboard.current.forEach((item, i) => {
          addNode(item.type, { x: 100 + i * 30, y: 100 + i * 30 });
          const newNodes = useWorkflowStore.getState().nodes;
          const newNode = newNodes[newNodes.length - 1];
          if (newNode) {
            useWorkflowStore.setState({
              nodes: newNodes.map(n =>
                n.id === newNode.id
                  ? { ...n, data: { ...n.data, widgetValues: { ...item.data.widgetValues } } }
                  : n
              ),
            });
          }
        });
      }
      // Delete
      if (e.key === "Delete" || e.key === "Backspace") {
        pushUndo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nodes, addNode, undo, redo, pushUndo]);

  // Drop from library — use screenToFlowPosition for correct placement
  const { screenToFlowPosition } = useReactFlow();

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

  // Minimap toggle
  const [showMinimap, setShowMinimap] = useState(false);

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
          <button
            className="minimap-toggle"
            onClick={() => setShowMinimap(!showMinimap)}
            title="Toggle minimap"
          >
            Map
          </button>
        </div>
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
