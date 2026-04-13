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
import { useLogStore, log, saveLogsNow } from "./store/logStore";
import { getPendingJobs, updatePendingJob, removePendingJob } from "./store/pendingJobs";
import { pollOperation } from "./api/googleMediaApi";
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
import VideoGenProNode from "./nodes/VideoGenProNode";
import ImagenNode from "./nodes/ImagenNode";
import MusicNode from "./nodes/MusicNode";
import TtsNode from "./nodes/TtsNode";
import MultiRefNode from "./nodes/MultiRefNode";
import TikTokPublishNode from "./nodes/TikTokPublishNode";
import UpscaleNode from "./nodes/UpscaleNode";
import GroupNode from "./nodes/GroupNode";
import CommentNode from "./nodes/CommentNode";
import Img2ImgNode from "./nodes/Img2ImgNode";
import KontextNode from "./nodes/KontextNode";
import LtxVideoNode from "./nodes/LtxVideoNode";
import NextFrameNode from "./nodes/NextFrameNode";
import RemoveBgNode from "./nodes/RemoveBgNode";
import InpaintNode from "./nodes/InpaintNode";
import CompareNode from "./nodes/CompareNode";
import EnhanceNode from "./nodes/EnhanceNode";
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
  videoGenProNode: VideoGenProNode,
  tikTokPublishNode: TikTokPublishNode,
  upscaleNode: UpscaleNode,
  groupNode: GroupNode,
  commentNode: CommentNode,
  img2ImgNode: Img2ImgNode,
  kontextNode: KontextNode,
  ltxVideoNode: LtxVideoNode,
  nextFrameNode: NextFrameNode,
  removeBgNode: RemoveBgNode,
  inpaintNode: InpaintNode,
  compareNode: CompareNode,
  enhanceNode: EnhanceNode,
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

        console.log("[App] ComfyUI connected, node defs loaded");
      })
      .catch((err) => {
        console.error("Failed to connect to ComfyUI:", err);
        setConnected(false);
      });

    // Load project INDEPENDENTLY of ComfyUI connection
    (async () => {
      try {
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
        console.log("[App] Project loaded");
        resumePendingJobs();
      } catch (err) {
        console.error("[App] Project load failed:", err);
      }
    })();
  }, [setNodeDefs, setConnected]);

  // Autosave (debounced, every 5 sec when changes happen)
  useEffect(() => {
    if (!currentProjectId || nodes.length === 0) return;
    const timer = setTimeout(() => { saveProject(); saveLogsNow(); }, 5000);
    return () => clearTimeout(timer);
  }, [nodes, edges, currentProjectId]);

  // Save on unload + warn if pending jobs
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      saveProject();
      const pendingJobs = getPendingJobs();
      const active = pendingJobs.filter((j) => j.status === "pending" || j.status === "polling");
      if (active.length > 0) {
        e.preventDefault();
        e.returnValue = `${active.length} generation(s) in progress. Leave anyway?`;
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveWorkflow]);

  // Resume pending cloud jobs after reload
  const resumePendingJobs = useCallback(async () => {
    const jobs = getPendingJobs();
    const active = jobs.filter((j) => (j.status === "pending" || j.status === "polling") && j.operationName);
    if (active.length === 0) return;

    log(`Resuming ${active.length} pending generation(s)`, { status: "warning" });

    for (const job of active) {
      updatePendingJob(job.id, { status: "polling" });
      log(`Resuming: ${job.model}`, { nodeId: job.nodeId, nodeType: job.nodeType, status: "info", details: job.prompt.slice(0, 50) });

      // Poll for Veo result
      (async () => {
        for (let i = 0; i < 300; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const poll = await pollOperation(job.operationName!);
            if (poll.error) {
              log(`Generation failed: ${poll.error}`, { nodeId: job.nodeId, nodeType: job.nodeType, status: "error" });
              updatePendingJob(job.id, { status: "failed" });
              return;
            }
            if (poll.done && poll.result) {
              let videoSrc: string | null = null;
              if (poll.result.videoBase64) {
                videoSrc = `data:video/mp4;base64,${poll.result.videoBase64}`;
              } else if (poll.result.videoUrl) {
                try {
                  const vRes = await fetch(poll.result.videoUrl);
                  const blob = await vRes.blob();
                  videoSrc = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                  });
                } catch {
                  videoSrc = poll.result.videoUrl;
                }
              }
              if (videoSrc) {
                useWorkflowStore.getState().updateWidgetValue(job.nodeId, "_previewUrl", videoSrc);
                log(`Generation complete (resumed)`, { nodeId: job.nodeId, nodeType: job.nodeType, status: "success" });
              }
              removePendingJob(job.id);
              return;
            }
          } catch { /* keep polling */ }
        }
        updatePendingJob(job.id, { status: "failed" });
        log(`Generation timeout (resumed)`, { nodeId: job.nodeId, nodeType: job.nodeType, status: "error" });
      })();
    }
  }, []);

  // Log helper
  const addLog = useCallback((msg: string) => {
    log(msg, { status: "info" });
  }, []);


  // WebSocket
  useEffect(() => {
    const nodeLabels: Record<string, string> = {
      CheckpointLoaderSimple: "Loading model",
      UNETLoader: "Loading model",
      UnetLoaderGGUF: "Loading GGUF model",
      CLIPLoader: "Loading text encoder",
      DualCLIPLoader: "Loading text encoders",
      LTXVGemmaCLIPModelLoader: "Loading Gemma encoder",
      CLIPTextEncode: "Encoding text",
      VAELoader: "Loading VAE",
      VAEDecode: "Decoding image",
      VAEEncode: "Encoding image",
      KSampler: "Sampling",
      LTXVBaseSampler: "Sampling video",
      LTXVTiledVAEDecode: "Decoding video",
      LTXVApplySTG: "Applying STG",
      CFGGuider: "Preparing guider",
      SaveImage: "Saving image",
      SaveVideo: "Saving video",
      SaveAnimatedWEBP: "Saving preview",
      CreateVideo: "Creating video",
      ImageUpscaleWithModel: "AI Upscaling",
      UpscaleModelLoader: "Loading upscaler",
      FluxKontextImageScale: "Scaling for Kontext",
      ReferenceLatent: "Setting reference",
      LoadImage: "Loading image",
    };
    const ws = connectWebSocket((data) => {
      if (data.type === "progress") {
        setProgress({ value: data.data.value, max: data.data.max });
        addLog(`Sampling: ${data.data.value}/${data.data.max}`);
      } else if (data.type === "executing" && data.data.node === null) {
        setProgress(null);
        addLog("Generation complete");
      } else if (data.type === "executing") {
        const classType = data.data.class_type || "";
        const label = nodeLabels[classType] || classType || `Node ${data.data.node}`;
        addLog(label);
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

  // Save undo state when user starts dragging a node
  const onNodeDragStart = useCallback(() => {
    pushUndo();
  }, [pushUndo]);

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
            onNodeDragStart={onNodeDragStart}
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

          {showLogs && <LogsPanel />}
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

// ── Logs Panel ──────────────────────────────────────────────────
function LogsPanel() {
  const entries = useLogStore((s) => s.entries);
  const clear = useLogStore((s) => s.clear);
  const loadLogs = useLogStore((s) => s.loadLogs);
  const loaded = useLogStore((s) => s.loaded);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const { fitView } = useReactFlow();
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Load persisted logs on first open
  useEffect(() => { loadLogs(); }, [loadLogs]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  const { setViewport, getViewport } = useReactFlow();

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNode(nodeId);
    useWorkflowStore.setState({
      nodes: useWorkflowStore.getState().nodes.map((n) => ({
        ...n,
        selected: n.id === nodeId,
      })),
    });

    // Smooth fly-to animation
    const node = useWorkflowStore.getState().nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const targetX = node.position.x + (node.measured?.width || 320) / 2;
    const targetY = node.position.y + (node.measured?.height || 300) / 2;
    const currentVp = getViewport();

    // Calculate distance
    const currentCenterX = (-currentVp.x + window.innerWidth / 2) / currentVp.zoom;
    const currentCenterY = (-currentVp.y + window.innerHeight / 2) / currentVp.zoom;
    const dist = Math.sqrt((targetX - currentCenterX) ** 2 + (targetY - currentCenterY) ** 2);

    // Direct fly — one smooth move, zoom to 0.7 minimum
    const finalZoom = Math.max(currentVp.zoom, 0.7);
    // Duration based on distance: fast but capped
    const duration = Math.min(Math.max(dist * 0.5, 300), 1200);

    setViewport({
      x: -targetX * finalZoom + window.innerWidth / 2,
      y: -targetY * finalZoom + window.innerHeight / 2,
      zoom: finalZoom,
    }, { duration });
  }, [setSelectedNode, setViewport, getViewport]);

  const statusIcon = (s: string) => s === "success" ? "✅" : s === "error" ? "❌" : s === "warning" ? "⚠️" : "·";
  const statusClass = (s: string) => s === "error" ? "log-error" : s === "success" ? "log-success" : s === "warning" ? "log-warning" : "";

  return (
    <div className="logs-panel">
      <div className="logs-header">
        <span>Logs ({entries.length})</span>
        <button onClick={clear}>Clear</button>
      </div>
      <div className="logs-content">
        {entries.length === 0 && <div className="logs-empty">No logs yet</div>}
        {entries.map((e) => (
          <div key={e.id} className={`log-line ${statusClass(e.status)}`}>
            <span className="log-time">{new Date(e.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            <span className="log-icon">{statusIcon(e.status)}</span>
            {e.nodeId && (
              <button className="log-node-id" onClick={() => handleNodeClick(e.nodeId!)} title={`Select ${e.nodeId}`}>
                {e.nodeLabel || e.nodeType?.replace("fs:", "") || e.nodeId}
              </button>
            )}
            <span className="log-action">{e.action}</span>
            {e.details && <span className="log-details">{e.details}</span>}
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>
    </div>
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
