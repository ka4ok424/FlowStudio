import { memo, useCallback, useState, useEffect } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt } from "../api/comfyApi";
import { log } from "../store/logStore";
import { pollForResult, fetchAsDataUrl, saveGenerationResult, getConnectedPrompt } from "../hooks/useNodeHelpers";
import { buildLocalGenWorkflow } from "../workflows/localGen";
import MediaHistory from "./MediaHistory";

function LocalGenerateNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);
  const nodeDefs = useWorkflowStore((s) => s.nodeDefs);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ value: number; max: number } | null>(null);
  const previewUrl = nodeData.widgetValues?._previewUrl || null;

  // Get available models from ComfyUI (filtered for image generation)
  const ALLOWED_MODELS = ["flux-2-klein-4b", "flux-2-klein-9b", "flux2_dev_fp8mixed", "flux1-dev", "z_image_turbo"];
  const [checkpoints, setCheckpoints] = useState<string[]>([]);
  useEffect(() => {
    const models: string[] = [];
    for (const loaderName of ["UNETLoader", "UnetLoaderGGUF", "CheckpointLoaderSimple"]) {
      if (nodeDefs[loaderName]) {
        const key = loaderName.includes("UNET") || loaderName.includes("Unet") ? "unet_name" : "ckpt_name";
        const config = nodeDefs[loaderName].input?.required?.[key];
        if (config && Array.isArray(config) && Array.isArray(config[0])) {
          for (const m of config[0]) {
            if (!models.includes(m) && ALLOWED_MODELS.some(a => m.toLowerCase().includes(a.toLowerCase()))) models.push(m);
          }
        }
      }
    }
    setCheckpoints(models);
  }, [nodeDefs]);

  const defaultModel = checkpoints.find(m => m.toLowerCase().includes("klein-9b") || m.toLowerCase().includes("klein_9b")) || checkpoints[0] || "";
  const selectedModel = nodeData.widgetValues?.model || defaultModel;
  const steps = nodeData.widgetValues?.steps || 4;
  const cfg = nodeData.widgetValues?.cfg || 7;
  const width = nodeData.widgetValues?.width || 720;
  const height = nodeData.widgetValues?.height || 1280;
  const seed = nodeData.widgetValues?.seed || "";
  const count: number = Math.max(1, Math.min(20, nodeData.widgetValues?.count ?? 1));
  const [batchInfo, setBatchInfo] = useState<{ done: number; total: number } | null>(null);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setProgress(null);
    const wv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const nRuns: number = Math.max(1, Math.min(20, wv.count ?? 1));

    const promptText = getConnectedPrompt(id, nodesAll as any[], edgesAll as any[]);
    if (!promptText) {
      setError("Connect a Prompt node with text");
      setGenerating(false);
      return;
    }

    log(`Generate started${nRuns > 1 ? ` ×${nRuns}` : ""}`, { nodeId: id, nodeType: "fs:localGenerate", nodeLabel: "Local Gen" });

    for (let i = 0; i < nRuns; i++) {
      if (nRuns > 1) setBatchInfo({ done: i, total: nRuns });
      const startTime = Date.now();
      // Batch: randomize seed each run, even if a seed was pinned on the node.
      const actualSeed = nRuns > 1
        ? Math.floor(Math.random() * 2147483647)
        : (seed ? parseInt(seed) : Math.floor(Math.random() * 2147483647));
      try {
        const workflow = buildLocalGenWorkflow({
          model: selectedModel, prompt: promptText,
          seed: actualSeed, steps, cfg, width, height,
        });
        const result = await queuePrompt(workflow);
        const pollResult = await pollForResult(result.prompt_id, { interval: 1000 });
        if (!pollResult || "error" in pollResult) {
          setError(pollResult ? pollResult.error : "Generation failed");
          log("Generate failed", { nodeId: id, nodeType: "fs:localGenerate", nodeLabel: "Local Gen", status: "error", details: pollResult && "error" in pollResult ? pollResult.error : "" });
          break;
        }
        const dataUrl = await fetchAsDataUrl(pollResult.apiUrl);
        updateWidgetValue(id, "_lastSeed", actualSeed);
        await saveGenerationResult(id, dataUrl, Date.now() - startTime, {
          prompt: promptText, model: selectedModel, seed: actualSeed.toString(),
          steps, cfg, width, height, nodeType: "fs:localGenerate",
        });
        log(`Image ready${nRuns > 1 ? ` (${i + 1}/${nRuns})` : ""}`, {
          nodeId: id, nodeType: "fs:localGenerate", nodeLabel: "Local Gen",
          status: "success", details: `${width}x${height}, seed ${actualSeed}`,
        });
      } catch (err: any) {
        setError(err.message);
        log("Generate error", { nodeId: id, nodeType: "fs:localGenerate", nodeLabel: "Local Gen", status: "error", details: err.message });
        break;
      }
    }
    setBatchInfo(null);
    useWorkflowStore.getState().saveProject();
    setGenerating(false);
  }, [id, selectedModel, steps, cfg, width, height, seed, edgesAll, nodesAll, updateWidgetValue]);

  // Connection highlighting
  const promptHL = connectingDir === "source" && (connectingType === "TEXT" || connectingType === "*") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(promptHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  const modelShort = selectedModel.split(/[/\\]/).pop()?.replace(".safetensors", "").replace(".ckpt", "") || "model";

  return (
    <div className={`localgen-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="localgen-node-inner">
        <div className="localgen-accent" />
        <div className="localgen-header">
          <span className="localgen-icon">⚡</span>
          <div className="localgen-header-text">
            <span className="localgen-title">Local Generate</span>
            <span className="localgen-status">
              {generating
                ? (batchInfo ? `BATCH ${batchInfo.done + 1}/${batchInfo.total}` : "GENERATING...")
                : (count > 1 ? `READY · ×${count}` : "READY")}
            </span>
          </div>
        </div>
      </div>

      <div className="localgen-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="prompt" className={`slot-handle ${promptHL}`} style={{ color: "#f0c040" }} />
          <TypeBadge color="#f0c040">TXT</TypeBadge>
          <span className="nanob-input-label">Prompt</span>
        </div>
      </div>

      <MediaHistory
        nodeId={id}
        history={nodeData.widgetValues?._history || []}
        historyIndex={nodeData.widgetValues?._historyIndex ?? -1}
        fallbackUrl={previewUrl}
        emptyIcon="⚡"
        genTime={nodeData.widgetValues?._genTime}
      />

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button
          className={`localgen-generate-btn ${generating ? "generating" : ""}data-fs-run-id={id} `}
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? `Generating...` : `⚡ Generate`}
        </button>
      </div>

      <div className="localgen-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-output-label">Output</span>
          <Handle type="source" position={Position.Right} id="output_0" className={`slot-handle ${outputHL}`} style={{ color: "#64b5f6" }} />
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="type-badge" style={{
      color, borderColor: color + "66", backgroundColor: color + "12",
    }}>{children}</span>
  );
}

export default memo(LocalGenerateNode);
