import { useEffect, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useWorkflowStore } from "./store/workflowStore";
import { fetchNodeDefs, connectWebSocket } from "./api/comfyApi";
import ComfyNode from "./nodes/ComfyNode";
import NodeLibrary from "./components/NodeLibrary";
import Toolbar from "./components/Toolbar";
import "./styles/theme.css";

const nodeTypes = { comfyNode: ComfyNode };

export default function App() {
  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    setNodeDefs, addNode, setConnected, setProgress,
  } = useWorkflowStore();

  useEffect(() => {
    fetchNodeDefs()
      .then((defs) => {
        setNodeDefs(defs);
        setConnected(true);
        console.log(`Loaded ${Object.keys(defs).length} node definitions`);
      })
      .catch((err) => {
        console.error("Failed to connect to ComfyUI:", err);
        setConnected(false);
      });
  }, [setNodeDefs, setConnected]);

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

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData("application/comfy-node-type");
      if (!nodeType) return;

      const reactFlowBounds = event.currentTarget.getBoundingClientRect();
      addNode(nodeType, {
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });
    },
    [addNode]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  return (
    <>
      <Toolbar />
      <div className="main-layout">
        <NodeLibrary />
        <div className="canvas-wrapper" onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            defaultEdgeOptions={{
              type: "smoothstep",
              animated: false,
              style: { stroke: "#5b9bd5", strokeWidth: 2 },
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#222230" />
            <Controls />
            <MiniMap nodeColor="#2a2a35" maskColor="rgba(0,0,0,0.6)" />
          </ReactFlow>
        </div>
      </div>
    </>
  );
}
