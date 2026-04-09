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
import PreviewNode from "./nodes/PreviewNode";
import CharacterCardNode from "./nodes/CharacterCardNode";
import SceneNode from "./nodes/SceneNode";
import StoryboardNode from "./nodes/StoryboardNode";
import VideoGenNode from "./nodes/VideoGenNode";
import ImagenNode from "./nodes/ImagenNode";
import MusicNode from "./nodes/MusicNode";
import TtsNode from "./nodes/TtsNode";
import MultiRefNode from "./nodes/MultiRefNode";
import AiChat from "./components/AiChat";
import MediaLibrary from "./components/MediaLibrary";
import { useMediaStore } from "./store/mediaStore";
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
  previewNode: PreviewNode,
  characterCardNode: CharacterCardNode,
  sceneNode: SceneNode,
  storyboardNode: StoryboardNode,
  videoGenNode: VideoGenNode,
  imagenNode: ImagenNode,
  musicNode: MusicNode,
  ttsNode: TtsNode,
  multiRefNode: MultiRefNode,
};

function App() {
  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    setNodeDefs, addNode, setConnected, setProgress,
    saveWorkflow, loadWorkflow, saveProject, loadProject, createProject, listProjects, currentProjectId,
    pushUndo, undo, redo,
    setConnecting, setSelectedNode, selectedNodeId,
  } = useWorkflowStore();

  const { guides, wrapNodesChange } = useSnappingNodes();

  // Wrap onNodesChange with snap logic
  const wrappedOnNodesChange = useMemo(
    () => wrapNodesChange(onNodesChange, nodes),
    [wrapNodesChange, onNodesChange, nodes]
  );

  // Load node defs + restore saved project
  useEffect(() => {
    fetchNodeDefs()
      .then(async (defs) => {
        setNodeDefs(defs);
        setConnected(true);
        console.log(`Loaded ${Object.keys(defs).length} node definitions`);

        // Load last project or create first one
        const lastId = localStorage.getItem("flowstudio_current_project");
        const projects = listProjects();
        if (lastId && projects.some((p) => p.id === lastId)) {
          await loadProject(lastId);
        } else if (projects.length > 0) {
          await loadProject(projects[0].id);
        } else {
          await createProject("My First Project");
        }
        useMediaStore.getState().loadFromStorage();

        // Migrate: re-save to move any data URLs from localStorage to IndexedDB
        // This frees up localStorage space
        await saveProject();
        console.log("[App] Project loaded and migrated");
      })
      .catch((err) => {
        console.error("Failed to connect to ComfyUI:", err);
        setConnected(false);
      });
  }, [setNodeDefs, setConnected]);

  // Autosave (debounced, every 2 sec when changes happen)
  useEffect(() => {
    if (!currentProjectId || nodes.length === 0) return;
    const timer = setTimeout(() => { saveProject(); }, 2000);
    return () => clearTimeout(timer);
  }, [nodes, edges, currentProjectId]);

  // Save on unload
  useEffect(() => {
    const handler = () => { saveWorkflow(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveWorkflow]);

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
    // Account for sidebars and toolbar
    const canvas = document.querySelector(".canvas-wrapper");
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      return screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    }
    // Fallback
    const { x, y, zoom } = getViewport();
    return {
      x: (-x + window.innerWidth / 2) / zoom,
      y: (-y + window.innerHeight / 2) / zoom,
    };
  }, [getViewport, screenToFlowPosition]);

  // Keyboard shortcuts: Copy/Paste/Undo/Redo
  const clipboard = useRef<{ nodes: any[]; edges: any[]; bounds: { cx: number; cy: number } } | null>(null);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      const isTextInput = tag === "input" || tag === "textarea" || (document.activeElement as HTMLElement)?.isContentEditable;

      // Undo: Ctrl+Z (skip if in text input — let native undo work)
      if (mod && e.key === "z" && !e.shiftKey && !isTextInput) {
        e.preventDefault();
        undo();
        return;
      }
      // Redo: Ctrl+Shift+Z (skip if in text input)
      if (mod && e.key === "z" && e.shiftKey && !isTextInput) {
        e.preventDefault();
        redo();
        return;
      }

      // Copy (skip if in text input — let native copy work)
      if (mod && e.key === "c" && !isTextInput) {
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

      // Paste (skip if in text input)
      if (mod && e.key === "v" && !isTextInput) {
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

      // Delete (skip if in text input — let native backspace/delete work)
      if ((e.key === "Delete" || e.key === "Backspace") && !isTextInput) {
        pushUndo();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
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
  const [showAiChat, setShowAiChat] = useState(false);
  const [rightTab, setRightTab] = useState<"inspector" | "ai">("inspector");
  const [sidebarTab, setSidebarTab] = useState<"nodes" | "media">("nodes");
  const [logs, setLogs] = useState<string[]>([]);

  // Node click → select for properties panel (Shift = multi-select toggle)
  const onNodeClick = useCallback((_: React.MouseEvent, node: any) => {
    if (_.shiftKey) {
      // Toggle selection on this node
      const isSelected = node.selected;
      useWorkflowStore.setState({
        nodes: useWorkflowStore.getState().nodes.map((n) =>
          n.id === node.id ? { ...n, selected: !isSelected } : n
        ),
      });
    } else {
      setSelectedNode(node.id);
    }
    setRightTab("inspector");
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
        <div className="node-library">
          <div className="sidebar-tabs">
            <button className={`sidebar-tab ${sidebarTab === "nodes" ? "active" : ""}`} onClick={() => setSidebarTab("nodes")}>Nodes</button>
            <button className={`sidebar-tab ${sidebarTab === "media" ? "active" : ""}`} onClick={() => setSidebarTab("media")}>Media</button>
          </div>
          {sidebarTab === "nodes" ? <NodeLibrary /> : <MediaLibrary />}
        </div>
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
            minZoom={0.1}
            maxZoom={2}
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
            <button className={`canvas-btn ${rightTab === "ai" ? "active" : ""}`} onClick={() => setRightTab(rightTab === "ai" ? "inspector" : "ai")}>AI</button>
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
        {/* Right sidebar with tabs */}
        {(selectedNodeId || rightTab === "ai") && (
          <div className="right-sidebar">
            <div className="sidebar-tabs">
              <button
                className={`sidebar-tab ${rightTab === "inspector" ? "active" : ""}`}
                onClick={() => setRightTab("inspector")}
              >Inspector</button>
              <button
                className={`sidebar-tab ${rightTab === "ai" ? "active" : ""}`}
                onClick={() => setRightTab("ai")}
              >AI Chat</button>
            </div>
            {rightTab === "inspector" && <PropertiesPanel />}
            {rightTab === "ai" && <AiChat open onClose={() => setRightTab("inspector")} />}
          </div>
        )}
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
