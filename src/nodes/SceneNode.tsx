import { memo, useCallback, useState, useEffect } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt, getImageUrl, getComfyUrl } from "../api/comfyApi";
import { addGenerationToLibrary } from "../store/mediaStore";
import MediaHistory from "./MediaHistory";
import { addToHistory } from "../utils/historyLimit";
import { log } from "../store/logStore";

const MAX_CHARACTERS = 8;

interface CharacterData {
  name: string;
  description: string;
  portraitUrl: string | null;
}

function SceneNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);
  const nodeDefs = useWorkflowStore((s) => s.nodeDefs);

  const sceneTitle = nodeData.widgetValues?.sceneTitle || "";
  const action = nodeData.widgetValues?.action || "";
  const previewUrl = nodeData.widgetValues?._previewUrl || null;
  const characterCount = nodeData.widgetValues?._characterCount || 1;
  const selectedModel = nodeData.widgetValues?.model || "";

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get available models
  const [checkpoints, setCheckpoints] = useState<string[]>([]);
  useEffect(() => {
    const models: string[] = [];
    for (const [loader, key] of [
      ["UNETLoader", "unet_name"],
      ["UnetLoaderGGUF", "unet_name"],
      ["CheckpointLoaderSimple", "ckpt_name"],
    ] as const) {
      const config = nodeDefs[loader]?.input?.required?.[key];
      if (config && Array.isArray(config) && Array.isArray(config[0])) {
        for (const m of config[0]) {
          if (!models.includes(m)) models.push(m);
        }
      }
    }
    setCheckpoints(models);
    if (!selectedModel && models.length > 0) {
      updateWidgetValue(id, "model", models[0]);
    }
  }, [nodeDefs]);

  // Read connected characters
  const getConnectedCharacters = useCallback((): CharacterData[] => {
    const chars: CharacterData[] = [];
    for (let i = 0; i < characterCount; i++) {
      const edge = edgesAll.find((e) => e.target === id && e.targetHandle === `character_${i}`);
      if (!edge) continue;
      const srcNode = nodesAll.find((n) => n.id === edge.source);
      if (!srcNode) continue;
      const sd = srcNode.data as any;
      chars.push({
        name: sd.widgetValues?.name || `Character ${i + 1}`,
        description: sd.widgetValues?.description || "",
        portraitUrl: sd.widgetValues?.portraitUrl || null,
      });
    }
    return chars;
  }, [id, characterCount, edgesAll, nodesAll]);

  // Read action text from connected prompt
  const getActionText = useCallback((): string => {
    const edge = edgesAll.find((e) => e.target === id && e.targetHandle === "action");
    if (!edge) return action; // fallback to manual input
    const srcNode = nodesAll.find((n) => n.id === edge.source);
    if (!srcNode) return action;
    return (srcNode.data as any).widgetValues?.text || action;
  }, [id, edgesAll, nodesAll, action]);

  // Read background from connected node
  const getBackgroundUrl = useCallback((): string | null => {
    const edge = edgesAll.find((e) => e.target === id && e.targetHandle === "background");
    if (!edge) return null;
    const srcNode = nodesAll.find((n) => n.id === edge.source);
    if (!srcNode) return null;
    const sd = srcNode.data as any;
    return sd.widgetValues?._previewUrl || sd.widgetValues?._preview || sd.widgetValues?.portraitUrl || null;
  }, [id, edgesAll, nodesAll]);

  const addCharacter = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (characterCount < MAX_CHARACTERS) {
      updateWidgetValue(id, "_characterCount", characterCount + 1);
    }
  }, [id, characterCount, updateWidgetValue]);

  const removeCharacter = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (characterCount > 1) {
      updateWidgetValue(id, "_characterCount", characterCount - 1);
    }
  }, [id, characterCount, updateWidgetValue]);

  // ── Generate Scene ───────────────────────────────────────────────
  const handleGenerate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();

    const chars = getConnectedCharacters();
    const actionText = getActionText();

    if (!actionText && chars.length === 0) {
      setError("Connect characters or describe the action");
      return;
    }

    setGenerating(true);
    setError(null);
    log("Scene generation started", { nodeId: id, nodeType: "fs:scene", nodeLabel: "Scene", details: actionText?.slice(0,60) });

    // Read ALL fresh values from store to avoid stale closures
    const freshNode = useWorkflowStore.getState().nodes.find(n => n.id === id);
    const freshWv = (freshNode?.data as any)?.widgetValues || {};
    const model = freshWv.model || checkpoints[0];
    if (!model) {
      setError("No models available");
      setGenerating(false);
      return;
    }
    const width = freshWv.width || 1024;
    const height = freshWv.height || 576;
    const steps = freshWv.steps || 4;
    const cfg = freshWv.cfg || 7;
    const modelLower = model.toLowerCase();

    // Build prompt from characters + action
    const charDescriptions = chars.map((c) =>
      `${c.name}: ${c.description}`
    ).join(". ");
    const promptText = [charDescriptions, actionText].filter(Boolean).join(". Scene: ");

    const actualSeed = Math.floor(Math.random() * 2147483647);

    // Collect character portraits for IP-Adapter
    const portraits = chars.map((c) => c.portraitUrl).filter(Boolean) as string[];

    // Build workflow
    let workflow: Record<string, any>;
    let nodeCounter = 1;

    const nid = () => String(nodeCounter++);

    // Upload portraits to ComfyUI for IP-Adapter
    // For now, generate without IP-Adapter if no portraits, with basic IP-Adapter if portraits exist
    const hasIPAdapter = portraits.length > 0 && nodeDefs["IPAdapterUnifiedLoader"];

    if (modelLower.includes("flux") && !modelLower.includes("gguf")) {
      const isKlein = modelLower.includes("klein");
      const isFlux2 = modelLower.includes("flux-2") || modelLower.includes("flux2") || isKlein;
      const clipNode = isFlux2
        ? { class_type: "CLIPLoader", inputs: { clip_name: "qwen_3_4b_fp4_flux2.safetensors", type: "flux2", device: "default" } }
        : { class_type: "DualCLIPLoader", inputs: { clip_name1: "clip_l.safetensors", clip_name2: "t5xxl_fp8_e4m3fn.safetensors", type: "flux" } };
      const vaeModel = isFlux2 ? "flux2-vae.safetensors" : "ae.safetensors";

      workflow = {
        "1": { class_type: "UNETLoader", inputs: { unet_name: model, weight_dtype: "default" } },
        "2": clipNode,
        "3": { class_type: "VAELoader", inputs: { vae_name: vaeModel } },
        "4": { class_type: "CLIPTextEncode", inputs: { text: promptText, clip: ["2", 0] } },
        "5": { class_type: "EmptySD3LatentImage", inputs: { width, height, batch_size: 1 } },
        "6": { class_type: "KSampler", inputs: {
          model: ["1", 0], positive: ["4", 0], negative: ["4", 0], latent_image: ["5", 0],
          seed: actualSeed, steps, cfg: isKlein ? 1.0 : cfg,
          sampler_name: "euler", scheduler: "simple", denoise: 1.0,
        }},
        "7": { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["3", 0] } },
        "8": { class_type: "SaveImage", inputs: { images: ["7", 0], filename_prefix: `SC_${Date.now()}` } },
      };
    } else if (modelLower.includes("gguf")) {
      workflow = {
        "1": { class_type: "UnetLoaderGGUF", inputs: { unet_name: model } },
        "2": { class_type: "DualCLIPLoader", inputs: { clip_name1: "clip_l.safetensors", clip_name2: "t5xxl_fp8_e4m3fn.safetensors", type: "flux" } },
        "3": { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } },
        "4": { class_type: "CLIPTextEncode", inputs: { text: promptText, clip: ["2", 0] } },
        "5": { class_type: "EmptySD3LatentImage", inputs: { width, height, batch_size: 1 } },
        "6": { class_type: "KSampler", inputs: {
          model: ["1", 0], positive: ["4", 0], negative: ["4", 0], latent_image: ["5", 0],
          seed: actualSeed, steps, cfg, sampler_name: "euler", scheduler: "simple", denoise: 1.0,
        }},
        "7": { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["3", 0] } },
        "8": { class_type: "SaveImage", inputs: { images: ["7", 0], filename_prefix: `SC_${Date.now()}` } },
      };
    } else {
      // SD / SDXL / SD3
      const isSD3 = modelLower.includes("sd3");

      // Base checkpoint
      const ckptId = nid(); // 1
      const posId = nid();  // 2
      const negId = nid();  // 3
      const latentId = nid(); // 4
      let modelRef: [string, number] = [ckptId, 0];

      workflow = {
        [ckptId]: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: model } },
        [posId]: { class_type: "CLIPTextEncode", inputs: { text: promptText, clip: [ckptId, 1] } },
        [negId]: { class_type: "CLIPTextEncode", inputs: { text: "", clip: [ckptId, 1] } },
        [latentId]: { class_type: isSD3 ? "EmptySD3LatentImage" : "EmptyLatentImage", inputs: { width, height, batch_size: 1 } },
      };

      // Add IP-Adapter for each portrait (SD/SDXL only for now)
      if (hasIPAdapter && !isSD3) {
        for (let i = 0; i < portraits.length; i++) {
          const ipaLoaderId = nid();
          const ipaApplyId = nid();
          const loadImageId = nid();

          // Upload portrait and load via LoadImage — we need the filename
          // For now, use LoadImageBase64 if available, otherwise skip
          // Actually, ComfyUI doesn't have LoadImageBase64 by default.
          // We'll upload the image first, then reference it.
          // For simplicity, use IPAdapterUnifiedLoader + IPAdapter with image upload

          workflow[loadImageId] = {
            class_type: "ETN_LoadImageBase64",
            inputs: { image: portraits[i].replace(/^data:image\/\w+;base64,/, "") },
          };

          // Check if ETN_LoadImageBase64 exists, otherwise we skip IP-Adapter
          if (!nodeDefs["ETN_LoadImageBase64"]) {
            // Fallback: no IP-Adapter, just text prompt
            break;
          }

          workflow[ipaLoaderId] = {
            class_type: "IPAdapterUnifiedLoader",
            inputs: { model: modelRef, preset: "PLUS (high strength)" },
          };

          workflow[ipaApplyId] = {
            class_type: "IPAdapter",
            inputs: {
              model: [ipaLoaderId, 0],
              ipadapter: [ipaLoaderId, 1],
              image: [loadImageId, 0],
              weight: 0.7 - (i * 0.1), // Decrease weight for each additional character
              start_at: 0.0,
              end_at: 1.0,
              weight_type: "standard",
            },
          };

          modelRef = [ipaApplyId, 0];
        }
      }

      const samplerId = nid();
      const decodeId = nid();
      const saveId = nid();

      workflow[samplerId] = { class_type: "KSampler", inputs: {
        model: modelRef, positive: [posId, 0], negative: [negId, 0], latent_image: [latentId, 0],
        seed: actualSeed, steps, cfg, sampler_name: "euler", scheduler: "normal", denoise: 1.0,
      }};
      workflow[decodeId] = { class_type: "VAEDecode", inputs: { samples: [samplerId, 0], vae: [ckptId, 2] } };
      workflow[saveId] = { class_type: "SaveImage", inputs: { images: [decodeId, 0], filename_prefix: `SC_${Date.now()}` } };
    }

    try {
      console.log("[Scene] Queuing workflow...", { chars: chars.length, hasIPAdapter, model, steps, cfg, width, height, seed: actualSeed });
      console.log("[Scene] Full workflow:", JSON.stringify(workflow, null, 2));
      const result = await queuePrompt(workflow);
      const promptId = result.prompt_id;

      // Poll for result
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const histRes = await fetch(`${getComfyUrl()}/api/history/${promptId}`);
          if (!histRes.ok) continue;
          const history = await histRes.json();

          if (history[promptId]) {
            const outputs = history[promptId].outputs;
            for (const nId of Object.keys(outputs || {})) {
              const images = outputs[nId]?.images;
              if (images && images.length > 0) {
                const img = images[0];
                const apiUrl = getImageUrl(img.filename, img.subfolder, img.type);
                updateWidgetValue(id, "_previewUrl", apiUrl);
                // Convert to data URL for persistence
                try {
                  const resp = await fetch(apiUrl);
                  const blob = await resp.blob();
                  const dataUrl = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                  });
                  updateWidgetValue(id, "_previewUrl", dataUrl);
                  const prev: string[] = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues?._history || [];
                  const { history: _h, index: _i } = await addToHistory(id, prev, dataUrl); updateWidgetValue(id, "_history", _h);
                  updateWidgetValue(id, "_historyIndex", _i);
                  addGenerationToLibrary(dataUrl, {
                    prompt: promptText, model, seed: actualSeed.toString(),
                    steps, cfg, width, height, nodeType: "fs:scene",
                  });
                } catch {
                  const prev2: string[] = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues?._history || [];
                  const { history: _h2, index: _i2 } = await addToHistory(id, prev2, apiUrl);
                  updateWidgetValue(id, "_history", _h2);
                  updateWidgetValue(id, "_historyIndex", _i2);
                }
                setGenerating(false);
                return;
              }
            }
            const st = history[promptId].status;
            if (st?.completed || st?.status_str === "error") {
              setError("Generation failed — check ComfyUI console");
              setGenerating(false);
              return;
            }
          }
        } catch { /* keep polling */ }
      }

      setError("Timeout (120s)");
      setGenerating(false);
    } catch (err: any) {
      setError(err.message);
      setGenerating(false);
    }
  }, [id, getConnectedCharacters, getActionText, selectedModel, checkpoints, nodeData.widgetValues, nodeDefs, updateWidgetValue]);

  // Connection highlighting
  const actionHL = connectingDir === "source" && connectingType === "TEXT" ? "highlight" : "";
  const bgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA") ? "highlight" : "";
  const charHL = connectingDir === "source" && (connectingType === "CHARACTER" || connectingType === "*") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "*") ? "highlight" : "";

  const hasCompatible = connectingType ? !!(actionHL || bgHL || charHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  // Read connected character names for display
  const connectedChars = getConnectedCharacters();

  return (
    <div
      className={`scene-node ${selected ? "selected" : ""} ${dimClass}`}
      onClick={() => setSelectedNode(id)}
    >
      <div className="scene-node-inner">
        <div className="scene-accent" />
        <div className="scene-header">
          <span className="scene-icon">🎬</span>
          <div className="scene-header-text">
            <span className="scene-title">{sceneTitle || "Scene"}</span>
            <span className="scene-status">
              {generating ? "GENERATING..." : connectedChars.length > 0 ? `${connectedChars.length} chars` : "READY"}
            </span>
          </div>
        </div>
      </div>

      {/* Inputs */}
      <div className="scene-inputs">
        {/* Action text */}
        <div className="scene-input-row">
          <Handle type="target" position={Position.Left} id="action"
            className={`slot-handle ${actionHL}`} style={{ color: "#f0c040" }} />
          <span className="scene-badge" style={{ color: "#f0c040", borderColor: "#f0c04066", backgroundColor: "#f0c04012" }}>TEXT</span>
          <span className="scene-input-label">Action</span>
        </div>

        {/* Background */}
        <div className="scene-input-row">
          <Handle type="target" position={Position.Left} id="background"
            className={`slot-handle ${bgHL}`} style={{ color: "#81c784" }} />
          <span className="scene-badge" style={{ color: "#81c784", borderColor: "#81c78466", backgroundColor: "#81c78412" }}>IMG</span>
          <span className="scene-input-label">Background</span>
        </div>

        {/* Dynamic character slots */}
        {Array.from({ length: characterCount }, (_, i) => (
          <div key={`char_${i}`} className="scene-input-row">
            <Handle type="target" position={Position.Left} id={`character_${i}`}
              className={`slot-handle ${charHL}`} style={{ color: "#a78bfa" }} />
            <span className="scene-badge" style={{ color: "#a78bfa", borderColor: "#a78bfa66", backgroundColor: "#a78bfa12" }}>CHAR</span>
            <span className="scene-input-label">
              {connectedChars[i]?.name || `Character ${i + 1}`}
            </span>
          </div>
        ))}

        {/* Add/remove character buttons */}
        <div className="scene-char-controls">
          {characterCount < MAX_CHARACTERS && (
            <button className="scene-char-btn" onClick={addCharacter} title="Add character">+</button>
          )}
          {characterCount > 1 && (
            <button className="scene-char-btn scene-char-remove" onClick={removeCharacter} title="Remove character">−</button>
          )}
          <span className="scene-char-count">{characterCount}/{MAX_CHARACTERS}</span>
        </div>
      </div>

      {/* Preview with history */}
      <MediaHistory
        nodeId={id}
        history={nodeData.widgetValues?._history || []}
        historyIndex={nodeData.widgetValues?._historyIndex ?? -1}
        fallbackUrl={previewUrl}
        emptyIcon="🎬"
      />

      {generating && (
        <div className="scene-progress">
          <div className="scene-progress-bar" />
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
          {generating ? "Generating..." : "🎬 Generate Scene"}
        </button>
        <button className="nanob-dice-btn" onClick={(e) => {
          e.stopPropagation();
          updateWidgetValue(id, "seed", Math.floor(Math.random() * 2147483647).toString());
        }} title="Random seed">🎲</button>
      </div>

      {/* Output */}
      <div className="scene-outputs">
        <div className="scene-output-row">
          <span className="scene-badge" style={{ color: "#64b5f6", borderColor: "#64b5f666", backgroundColor: "#64b5f612" }}>IMG</span>
          <span className="scene-output-label">Scene</span>
          <Handle type="source" position={Position.Right} id="scene_out"
            className={`slot-handle ${outputHL}`} style={{ color: "#64b5f6" }} />
        </div>
      </div>
    </div>
  );
}

export default memo(SceneNode);
