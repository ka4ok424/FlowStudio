import { memo, useCallback, useState, useEffect } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt, getImageUrl, uploadImage } from "../api/comfyApi";
import { addGenerationToLibrary } from "../store/mediaStore";
import MediaHistory from "./MediaHistory";

const MAX_REFS = 8;

function MultiRefNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);
  const nodeDefs = useWorkflowStore((s) => s.nodeDefs);

  const previewUrl = nodeData.widgetValues?._previewUrl || null;
  const refCount = nodeData.widgetValues?._refCount || 2;

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get models
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
  }, [nodeDefs]);

  const addRef = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (refCount < MAX_REFS) updateWidgetValue(id, "_refCount", refCount + 1);
  }, [id, refCount, updateWidgetValue]);

  const removeRef = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (refCount > 1) updateWidgetValue(id, "_refCount", refCount - 1);
  }, [id, refCount, updateWidgetValue]);

  // Collect reference images + character info from connected nodes
  interface RefData { url: string; name?: string; description?: string; }
  const getRefData = useCallback((): RefData[] => {
    const refs: RefData[] = [];
    for (let i = 0; i < refCount; i++) {
      const edge = edgesAll.find((e) => e.target === id && e.targetHandle === `ref_${i}`);
      if (!edge) continue;
      const srcNode = nodesAll.find((n) => n.id === edge.source);
      if (!srcNode) continue;
      const sd = srcNode.data as any;
      const url = sd.widgetValues?._previewUrl || sd.widgetValues?._preview || sd.widgetValues?.portraitUrl;
      if (url) {
        refs.push({
          url,
          name: sd.widgetValues?.name,
          description: sd.widgetValues?.description,
        });
      }
    }
    return refs;
  }, [id, refCount, edgesAll, nodesAll]);

  // Get style ref
  const getStyleRef = useCallback((): string | null => {
    const edge = edgesAll.find((e) => e.target === id && e.targetHandle === "style_ref");
    if (!edge) return null;
    const srcNode = nodesAll.find((n) => n.id === edge.source);
    if (!srcNode) return null;
    const sd = srcNode.data as any;
    return sd.widgetValues?._previewUrl || sd.widgetValues?._preview || sd.widgetValues?.portraitUrl || null;
  }, [id, edgesAll, nodesAll]);

  const handleGenerate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Get prompt
    let promptText = "";
    const promptEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "prompt");
    if (promptEdge) {
      const srcNode = nodesAll.find((n) => n.id === promptEdge.source);
      if (srcNode) promptText = (srcNode.data as any).widgetValues?.text || "";
    }
    if (!promptText) { setError("Connect a Prompt node"); return; }

    const refs = getRefData();
    if (refs.length === 0) { setError("Connect at least one reference image"); return; }

    // Enrich prompt with character descriptions for positioning
    const charDescriptions = refs
      .filter((r) => r.name || r.description)
      .map((r, i) => {
        const name = r.name || `character ${i + 1}`;
        const desc = r.description ? `, ${r.description.slice(0, 100)}` : "";
        return `${name}${desc}`;
      });
    if (charDescriptions.length > 0) {
      promptText = `${promptText}. Characters in the scene: ${charDescriptions.join("; ")}. Each character is a separate person, clearly distinct from each other.`;
    }

    setGenerating(true);
    setError(null);

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const width = freshWv.width || 1024;
    const height = freshWv.height || 1024;
    const steps = freshWv.steps || 4;
    const cfg = freshWv.cfg || 1.5;
    const actualSeed = Math.floor(Math.random() * 2147483647);
    const styleRef = getStyleRef();

    // Collect all images (refs + optional style)
    const refImages = refs.map((r) => r.url);
    const allImages = [...refImages];
    if (styleRef) allImages.push(styleRef);

    // Upload all reference images to ComfyUI
    const uploadedNames: string[] = [];
    try {
      for (let i = 0; i < allImages.length; i++) {
        const img = allImages[i];
        if (img.startsWith("data:")) {
          const name = await uploadImage(img, `fs_multiref_${Date.now()}_${i}.png`);
          uploadedNames.push(name);
        } else {
          // blob URL — fetch and re-upload
          const resp = await fetch(img);
          const blob = await resp.blob();
          const reader = new FileReader();
          const dataUrl = await new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          const name = await uploadImage(dataUrl, `fs_multiref_${Date.now()}_${i}.png`);
          uploadedNames.push(name);
        }
      }
    } catch (err: any) {
      setError(`Upload failed: ${err.message}`);
      setGenerating(false);
      return;
    }

    // Build SDXL Lightning + IP-Adapter workflow
    const wf: Record<string, any> = {};

    // 1. Load SDXL Lightning checkpoint (always use SDXL for multi-ref)
    wf["1"] = { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sdxl_lightning_4step.safetensors" } };

    // 2. Load IP-Adapter (auto-selects CLIP Vision ViT-H)
    wf["2"] = { class_type: "IPAdapterUnifiedLoader", inputs: { model: ["1", 0], preset: "PLUS (high strength)" } };

    let modelRef: [string, number] = ["2", 0];
    let nodeCounter = 10;

    // 3. Chain IP-Adapter for each uploaded image
    for (let i = 0; i < uploadedNames.length; i++) {
      const isStyle = styleRef && i === uploadedNames.length - 1;
      const baseWeight = freshWv.ipWeight || 0.35;
      const weight = isStyle ? (freshWv.styleWeight || 0.3) : (baseWeight - i * 0.05);

      const loadId = String(nodeCounter++);
      wf[loadId] = { class_type: "LoadImage", inputs: { image: uploadedNames[i] } };

      const applyId = String(nodeCounter++);
      wf[applyId] = {
        class_type: "IPAdapter",
        inputs: {
          model: modelRef,
          ipadapter: ["2", 1],
          image: [loadId, 0],
          weight: Math.max(0.1, Math.min(1.5, weight)),
          start_at: 0.0,
          end_at: 1.0,
          weight_type: isStyle ? "style transfer" : "standard",
        },
      };
      modelRef = [applyId, 0];
    }

    // 4. Text encode (positive + negative)
    wf["3"] = { class_type: "CLIPTextEncode", inputs: { text: promptText, clip: ["1", 1] } };
    wf["4"] = { class_type: "CLIPTextEncode", inputs: { text: "ugly, blurry, low quality, deformed", clip: ["1", 1] } };

    // 5. Latent + Sampler + Decode
    wf["5"] = { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } };

    const samplerId = String(nodeCounter++);
    wf[samplerId] = {
      class_type: "KSampler",
      inputs: {
        model: modelRef,
        positive: ["3", 0],
        negative: ["4", 0],
        latent_image: ["5", 0],
        seed: actualSeed,
        steps: Math.max(steps, 4),
        cfg,
        sampler_name: "euler",
        scheduler: "sgm_uniform",
        denoise: 1.0,
      },
    };

    // Decode + Save
    const decodeId = String(nodeCounter++);
    const saveId = String(nodeCounter++);
    wf[decodeId] = {
      class_type: "VAEDecode",
      inputs: { samples: [samplerId, 0], vae: ["1", 2] },
    };
    wf[saveId] = {
      class_type: "SaveImage",
      inputs: { images: [decodeId, 0], filename_prefix: `MR_${Date.now()}` },
    };

    try {
      console.log("[MultiRef] Queuing workflow...", { refs: refImages.length, hasStyle: !!styleRef, model: "sdxl_lightning_4step", steps, width, height });
      const result = await queuePrompt(wf);
      const promptId = result.prompt_id;

      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const histRes = await fetch(`/api/history/${promptId}`);
          if (!histRes.ok) continue;
          const history = await histRes.json();

          if (history[promptId]) {
            const outputs = history[promptId].outputs;
            for (const nodeKey of Object.keys(outputs || {})) {
              const images = outputs[nodeKey]?.images;
              if (images && images.length > 0) {
                const img = images[0];
                const apiUrl = getImageUrl(img.filename, img.subfolder, img.type);
                updateWidgetValue(id, "_previewUrl", apiUrl);
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
                  updateWidgetValue(id, "_history", [...prev, dataUrl]);
                  updateWidgetValue(id, "_historyIndex", prev.length);
                  addGenerationToLibrary(dataUrl, {
                    prompt: promptText, model: "sdxl_lightning_4step", seed: actualSeed.toString(),
                    steps, cfg, width, height, nodeType: "fs:multiRef",
                  });
                } catch {
                  const prev: string[] = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues?._history || [];
                  updateWidgetValue(id, "_history", [...prev, apiUrl]);
                  updateWidgetValue(id, "_historyIndex", prev.length);
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
  }, [id, edgesAll, nodesAll, checkpoints, nodeDefs, getRefData, getStyleRef, updateWidgetValue]);

  // Highlighting
  const promptHL = connectingDir === "source" && connectingType === "TEXT" ? "highlight" : "";
  const imgHL = connectingDir === "source" && connectingType === "IMAGE" ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(promptHL || imgHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  return (
    <div
      className={`multiref-node ${selected ? "selected" : ""} ${dimClass}`}
      onClick={() => setSelectedNode(id)}
    >
      <div className="multiref-node-inner">
        <div className="multiref-accent" />
        <div className="multiref-header">
          <span className="multiref-icon">🔗</span>
          <div className="multiref-header-text">
            <span className="multiref-title">Multi Reference</span>
            <span className="multiref-status">{generating ? "GENERATING..." : `${refCount} refs`}</span>
          </div>
        </div>
      </div>

      {/* Inputs */}
      <div className="multiref-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="prompt"
            className={`slot-handle ${promptHL}`} style={{ color: "#f0c040" }} />
          <TypeBadge color="#f0c040">TEXT</TypeBadge>
          <span className="nanob-input-label">Prompt</span>
        </div>

        {/* Dynamic reference slots */}
        {Array.from({ length: refCount }, (_, i) => (
          <div key={`ref_${i}`} className="nanob-input-row">
            <Handle type="target" position={Position.Left} id={`ref_${i}`}
              className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
            <TypeBadge color="#64b5f6">IMG</TypeBadge>
            <span className="nanob-input-label">Ref {i + 1}</span>
          </div>
        ))}

        {/* Style reference */}
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="style_ref"
            className={`slot-handle ${imgHL}`} style={{ color: "#ce93d8" }} />
          <TypeBadge color="#ce93d8">IMG</TypeBadge>
          <span className="nanob-input-label">Style</span>
        </div>

        {/* Add/remove ref buttons */}
        <div className="scene-char-controls" style={{ paddingLeft: 14 }}>
          {refCount < MAX_REFS && (
            <button className="scene-char-btn" onClick={addRef} title="Add reference">+</button>
          )}
          {refCount > 1 && (
            <button className="scene-char-btn scene-char-remove" onClick={removeRef} title="Remove reference">−</button>
          )}
          <span className="scene-char-count">{refCount}/{MAX_REFS}</span>
        </div>
      </div>

      {/* Preview */}
      <MediaHistory
        nodeId={id}
        history={nodeData.widgetValues?._history || []}
        historyIndex={nodeData.widgetValues?._historyIndex ?? -1}
        fallbackUrl={previewUrl}
        emptyIcon="🔗"
      />

      {error && <div className="nanob-error">{error}</div>}

      <div className="nanob-actions">
        <button
          className={`localgen-generate-btn ${generating ? "generating" : ""}`}
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? "Generating..." : "🔗 Generate"}
        </button>
        <button className="nanob-dice-btn" onClick={(e) => {
          e.stopPropagation();
          updateWidgetValue(id, "seed", Math.floor(Math.random() * 2147483647).toString());
        }} title="Random seed">🎲</button>
      </div>

      <div className="multiref-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <TypeBadge color="#64b5f6">IMAGE</TypeBadge>
          <span className="nanob-output-label">Output</span>
          <Handle type="source" position={Position.Right} id="output_0"
            className={`slot-handle ${outputHL}`} style={{ color: "#64b5f6" }} />
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

export default memo(MultiRefNode);
