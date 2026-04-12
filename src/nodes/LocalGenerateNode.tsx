import { memo, useCallback, useState, useEffect } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt, getImageUrl, getComfyUrl } from "../api/comfyApi";
import { addGenerationToLibrary } from "../store/mediaStore";
import MediaHistory from "./MediaHistory";
import { addToHistory } from "../utils/historyLimit";
import { log } from "../store/logStore";

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

  // Get available models from ComfyUI (checkpoints + diffusion_models + GGUF)
  const [checkpoints, setCheckpoints] = useState<string[]>([]);
  useEffect(() => {
    const models: string[] = [];
    // Diffusion models (Flux, etc.)
    if (nodeDefs["UNETLoader"]) {
      const config = nodeDefs["UNETLoader"].input?.required?.unet_name;
      if (config && Array.isArray(config) && Array.isArray(config[0])) {
        models.push(...config[0]);
      }
    }
    // GGUF models
    if (nodeDefs["UnetLoaderGGUF"]) {
      const config = nodeDefs["UnetLoaderGGUF"].input?.required?.unet_name;
      if (config && Array.isArray(config) && Array.isArray(config[0])) {
        for (const m of config[0]) {
          if (!models.includes(m)) models.push(m);
        }
      }
    }
    // Standard checkpoints
    if (nodeDefs["CheckpointLoaderSimple"]) {
      const config = nodeDefs["CheckpointLoaderSimple"].input?.required?.ckpt_name;
      if (config && Array.isArray(config) && Array.isArray(config[0])) {
        for (const m of config[0]) {
          if (!models.includes(m)) models.push(m);
        }
      }
    }
    setCheckpoints(models);
  }, [nodeDefs]);

  const defaultModel = checkpoints.find(m => m.toLowerCase().includes("klein-9b") || m.toLowerCase().includes("klein_9b")) || checkpoints[0] || "";
  const selectedModel = nodeData.widgetValues?.model || defaultModel;
  const steps = nodeData.widgetValues?.steps || 4;
  const cfg = nodeData.widgetValues?.cfg || 7;
  const width = nodeData.widgetValues?.width || 512;
  const height = nodeData.widgetValues?.height || 512;
  const seed = nodeData.widgetValues?.seed || "";

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setProgress(null);
    const startTime = Date.now();
    log("Generate started", { nodeId: id, nodeType: "fs:localGenerate", nodeLabel: "Local Gen" });

    // Get prompt from connected Prompt node
    let promptText = "";
    const promptEdge = edgesAll.find((e) => e.target === id && e.targetHandle === "prompt");
    if (promptEdge) {
      const promptNode = nodesAll.find((n) => n.id === promptEdge.source);
      if (promptNode) promptText = (promptNode.data as any).widgetValues?.text || "";
    }

    if (!promptText) {
      setError("Connect a Prompt node with text");
      setGenerating(false);
      return;
    }

    const actualSeed = seed ? parseInt(seed) : Math.floor(Math.random() * 2147483647);
    const modelLower = selectedModel.toLowerCase();

    // Detect model type and build appropriate workflow
    let workflow: Record<string, any>;

    if (modelLower.includes("flux") && !modelLower.includes("gguf")) {
      // ── Flux workflow ──
      const isKlein = modelLower.includes("klein");
      const isKlein9B = isKlein && modelLower.includes("9b");
      const isFlux2Dev = !isKlein && (modelLower.includes("flux2-dev") || modelLower.includes("flux2") && modelLower.includes("dev"));
      const isFlux2 = modelLower.includes("flux-2") || modelLower.includes("flux2") || isKlein;

      // Select text encoder based on model variant
      let clipNode: Record<string, any>;
      if (isKlein9B) {
        clipNode = { class_type: "CLIPLoader", inputs: { clip_name: "qwen3_8b_klein9b.safetensors", type: "flux2", device: "default" } };
      } else if (isFlux2Dev) {
        clipNode = { class_type: "CLIPLoader", inputs: { clip_name: "mistral_3_small_flux2_fp8.safetensors", type: "flux2", device: "default" } };
      } else if (isFlux2) {
        clipNode = { class_type: "CLIPLoader", inputs: { clip_name: "qwen_3_4b_fp4_flux2.safetensors", type: "flux2", device: "default" } };
      } else {
        clipNode = { class_type: "DualCLIPLoader", inputs: { clip_name1: "clip_l.safetensors", clip_name2: "t5xxl_fp8_e4m3fn.safetensors", type: "flux" } };
      }

      const vaeModel = isFlux2 ? "flux2-vae.safetensors" : "ae.safetensors";

      workflow = {
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: selectedModel, weight_dtype: "default" },
        },
        "2": clipNode,
        "3": {
          class_type: "VAELoader",
          inputs: { vae_name: vaeModel },
        },
        "4": {
          class_type: "CLIPTextEncode",
          inputs: { text: promptText, clip: ["2", 0] },
        },
        "5": {
          class_type: "EmptySD3LatentImage",
          inputs: { width, height, batch_size: 1 },
        },
        "6": {
          class_type: "KSampler",
          inputs: {
            model: ["1", 0],
            positive: ["4", 0],
            negative: ["4", 0],
            latent_image: ["5", 0],
            seed: actualSeed,
            steps,
            cfg: isKlein ? 1.0 : cfg,
            sampler_name: "euler",
            scheduler: "simple",
            denoise: 1.0,
          },
        },
        "7": {
          class_type: "VAEDecode",
          inputs: { samples: ["6", 0], vae: ["3", 0] },
        },
        "8": {
          class_type: "SaveImage",
          inputs: { images: ["7", 0], filename_prefix: `FS_${Date.now()}` },
        },
      };
    } else if (modelLower.includes("gguf")) {
      // ── GGUF workflow ──
      workflow = {
        "1": {
          class_type: "UnetLoaderGGUF",
          inputs: { unet_name: selectedModel },
        },
        "2": {
          class_type: "DualCLIPLoader",
          inputs: { clip_name1: "clip_l.safetensors", clip_name2: "t5xxl_fp8_e4m3fn.safetensors", type: "flux" },
        },
        "3": {
          class_type: "VAELoader",
          inputs: { vae_name: "ae.safetensors" },
        },
        "4": {
          class_type: "CLIPTextEncode",
          inputs: { text: promptText, clip: ["2", 0] },
        },
        "5": {
          class_type: "EmptySD3LatentImage",
          inputs: { width, height, batch_size: 1 },
        },
        "6": {
          class_type: "KSampler",
          inputs: {
            model: ["1", 0],
            positive: ["4", 0],
            negative: ["4", 0],
            latent_image: ["5", 0],
            seed: actualSeed,
            steps,
            cfg,
            sampler_name: "euler",
            scheduler: "simple",
            denoise: 1.0,
          },
        },
        "7": {
          class_type: "VAEDecode",
          inputs: { samples: ["6", 0], vae: ["3", 0] },
        },
        "8": {
          class_type: "SaveImage",
          inputs: { images: ["7", 0], filename_prefix: `FS_${Date.now()}` },
        },
      };
    } else if (modelLower.includes("sd3")) {
      // ── SD 3.5 workflow (TripleCLIP) ──
      workflow = {
        "1": {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: selectedModel },
        },
        "2": {
          class_type: "CLIPTextEncode",
          inputs: { text: promptText, clip: ["1", 1] },
        },
        "3": {
          class_type: "CLIPTextEncode",
          inputs: { text: "", clip: ["1", 1] },
        },
        "4": {
          class_type: "EmptySD3LatentImage",
          inputs: { width, height, batch_size: 1 },
        },
        "5": {
          class_type: "KSampler",
          inputs: {
            model: ["1", 0],
            positive: ["2", 0],
            negative: ["3", 0],
            latent_image: ["4", 0],
            seed: actualSeed,
            steps,
            cfg,
            sampler_name: "euler",
            scheduler: "normal",
            denoise: 1.0,
          },
        },
        "6": {
          class_type: "VAEDecode",
          inputs: { samples: ["5", 0], vae: ["1", 2] },
        },
        "7": {
          class_type: "SaveImage",
          inputs: { images: ["6", 0], filename_prefix: `FS_${Date.now()}` },
        },
      };
    } else {
      // ── Standard SD 1.5 / SDXL workflow ──
      workflow = {
        "1": {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: selectedModel },
        },
        "2": {
          class_type: "CLIPTextEncode",
          inputs: { text: promptText, clip: ["1", 1] },
        },
        "3": {
          class_type: "CLIPTextEncode",
          inputs: { text: "", clip: ["1", 1] },
        },
        "4": {
          class_type: "EmptyLatentImage",
          inputs: { width, height, batch_size: 1 },
        },
        "5": {
          class_type: "KSampler",
          inputs: {
            model: ["1", 0],
            positive: ["2", 0],
            negative: ["3", 0],
            latent_image: ["4", 0],
            seed: actualSeed,
            steps,
            cfg,
            sampler_name: "euler",
            scheduler: "normal",
            denoise: 1.0,
          },
        },
        "6": {
          class_type: "VAEDecode",
          inputs: { samples: ["5", 0], vae: ["1", 2] },
        },
        "7": {
          class_type: "SaveImage",
          inputs: { images: ["6", 0], filename_prefix: `FS_${Date.now()}` },
        },
      };
    }

    try {
      console.log("[LocalGen] Queuing workflow...");
      const result = await queuePrompt(workflow);
      const promptId = result.prompt_id;
      console.log("[LocalGen] Prompt ID:", promptId);

      // Poll for completion instead of WebSocket (more reliable)
      const pollForResult = async () => {
        for (let attempt = 0; attempt < 120; attempt++) {
          await new Promise((r) => setTimeout(r, 1000));

          try {
            const histRes = await fetch(`${getComfyUrl()}/api/history/${promptId}`);
            if (!histRes.ok) continue;
            const history = await histRes.json();

            if (history[promptId]) {
              const outputs = history[promptId].outputs;
              // Find SaveImage output (could be node "7" or "8")
              for (const nodeId of Object.keys(outputs || {})) {
                const images = outputs[nodeId]?.images;
                if (images && images.length > 0) {
                  const img = images[0];
                  const apiUrl = getImageUrl(img.filename, img.subfolder, img.type);
                  // Show API URL immediately for fast preview
                  updateWidgetValue(id, "_previewUrl", apiUrl);
                  console.log("[LocalGen] Image ready:", apiUrl);

                  // Convert to data URL for persistence
                  try {
                    const resp = await fetch(apiUrl);
                    const blob = await resp.blob();
                    const dataUrl = await new Promise<string>((resolve) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result as string);
                      reader.readAsDataURL(blob);
                    });
                    // Update preview + history with persistent data URL
                    updateWidgetValue(id, "_genTime", Date.now() - startTime);
                    updateWidgetValue(id, "_lastSeed", actualSeed);
                    updateWidgetValue(id, "_previewUrl", dataUrl);
                    const prevHist: string[] = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues?._history || [];
                    const { history: newHist, index: newIdx } = await addToHistory(id, prevHist, dataUrl);
                    updateWidgetValue(id, "_history", newHist);
                    updateWidgetValue(id, "_historyIndex", newIdx);
                    // Save to media library
                    addGenerationToLibrary(dataUrl, {
                      prompt: promptText,
                      model: selectedModel,
                      seed: actualSeed.toString(),
                      steps, cfg, width, height,
                      nodeType: "fs:localGenerate",
                      duration: Date.now() - startTime,
                    });
                  } catch {
                    // Fallback: use API URL (won't persist)
                    const prevHist2: string[] = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues?._history || [];
                    const { history: newHist2, index: newIdx2 } = await addToHistory(id, prevHist2, apiUrl);
                    updateWidgetValue(id, "_history", newHist2);
                    updateWidgetValue(id, "_historyIndex", newIdx2);
                  }
                  log("Image ready", { nodeId: id, nodeType: "fs:localGenerate", nodeLabel: "Local Gen", status: "success", details: `${width}x${height}, ${steps} steps` });
                  // Save project immediately to persist the result
                  useWorkflowStore.getState().saveProject();
                  setGenerating(false);
                  setProgress(null);
                  return;
                }
              }

              // Check for errors
              const status = history[promptId].status;
              if (status?.completed || status?.status_str === "error") {
                setError("Generation failed — check ComfyUI console");
                setGenerating(false);
                return;
              }
            }
          } catch { /* keep polling */ }

          // Update progress from queue
          try {
            const qRes = await fetch("/api/queue");
            const q = await qRes.json();
            const running = q.queue_running?.find((r: any) => r[1] === promptId);
            if (running) {
              // Still running
            } else if (!q.queue_pending?.find((p: any) => p[1] === promptId)) {
              // Not in queue anymore — check history one more time
              await new Promise((r) => setTimeout(r, 500));
              continue;
            }
          } catch { /* ignore */ }
        }

        setError("Generation timed out (120s)");
        setGenerating(false);
      };

      pollForResult();
    } catch (err: any) {
      setError(err.message);
      console.error("[LocalGen]", err);
      setGenerating(false);
    }
  }, [id, edgesAll, nodesAll, selectedModel, steps, cfg, width, height, seed, updateWidgetValue]);

  const promptHL = connectingDir === "source" && connectingType === "TEXT" ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "*") ? "highlight" : "";

  const hasCompatible = connectingType ? (promptHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  return (
    <div
      className={`localgen-node ${selected ? "selected" : ""} ${dimClass}`}
      onClick={() => setSelectedNode(id)}
    >
      <div className="localgen-node-inner">
        <div className="localgen-accent" />
        <div className="localgen-header">
          <span className="localgen-icon">⚡</span>
          <div className="localgen-header-text">
            <span className="localgen-title">Local Generate</span>
            <span className="localgen-status">
              {generating ? "GENERATING..." : "READY"}
            </span>
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="localgen-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="prompt"
            className={`slot-handle ${promptHL}`} style={{ color: "#f0c040" }} />
          <TypeBadge color="#f0c040">TEXT</TypeBadge>
          <span className="nanob-input-label">Prompt</span>
        </div>
      </div>

      {/* Preview with history */}
      <MediaHistory
        nodeId={id}
        history={nodeData.widgetValues?._history || []}
        historyIndex={nodeData.widgetValues?._historyIndex ?? -1}
        fallbackUrl={previewUrl}
        emptyIcon="⚡"
        genTime={nodeData.widgetValues?._genTime}
      />

      {/* Progress bar */}
      {progress && (
        <div className="localgen-progress">
          <div className="localgen-progress-fill" style={{ width: `${(progress.value / progress.max) * 100}%` }} />
          <span className="localgen-progress-text">{progress.value}/{progress.max}</span>
        </div>
      )}

      {error && <div className="nanob-error nodrag">{error}</div>}

      {/* Generate */}
      <div className="nanob-actions">
        <button
          className={`localgen-generate-btn ${generating ? "generating" : ""}`}
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? `Generating...` : "⚡ Generate"}
        </button>
        <button className="nanob-dice-btn" onClick={() =>
          updateWidgetValue(id, "seed", Math.floor(Math.random() * 2147483647).toString())
        } title="Random seed">🎲</button>
      </div>

      {/* Output */}
      <div className="nanob-output">
        <TypeBadge color="#64b5f6">IMAGE</TypeBadge>
        <span className="nanob-output-label">Output</span>
        <Handle type="source" position={Position.Right} id="output_0"
          className={`slot-handle ${outputHL}`}
          style={{ color: "#64b5f6", top: "50px" }} />
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
