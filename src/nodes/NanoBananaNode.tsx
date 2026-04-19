import { memo, useCallback, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { generateImage } from "../api/geminiApi";
import { addGenerationToLibrary } from "../store/mediaStore";
import MediaHistory from "./MediaHistory";
import { addToHistory } from "../utils/historyLimit";
import { log } from "../store/logStore";
import { dataUrlToBlobUrl } from "../utils/blobUrl";

const MAX_REFS = 14;

function NanoBananaNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const allEdges = useWorkflowStore((s) => s.edges);

  const errorHandles = new Set(
    allEdges.filter((e) => e.target === id && (e as any).data?.error).map((e) => e.targetHandle)
  );

  const [generating, setGenerating] = useState(false);
  const [batchInfo, setBatchInfo] = useState<{ done: number; total: number } | null>(null);
  const count: number = Math.max(1, Math.min(20, nodeData.widgetValues?.count ?? 1));
  const [error, setError] = useState<string | null>(null);
  const previewUrl = nodeData.widgetValues?._previewUrl || null;
  const refCount = nodeData.widgetValues?._refCount || 1;
  const nodes = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    const wv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const nRuns: number = Math.max(1, Math.min(20, wv.count ?? 1));
    log(`Generate started${nRuns > 1 ? ` ×${nRuns}` : ""}`, { nodeId: id, nodeType: "fs:nanoBanana", nodeLabel: "Nano Banana" });

    // Get prompt from connected Prompt node
    let prompt = "";
    const promptEdge = edgesAll.find((e) => e.target === id && e.targetHandle === "prompt");
    if (promptEdge) {
      const promptNode = nodes.find((n) => n.id === promptEdge.source);
      if (promptNode) prompt = (promptNode.data as any).widgetValues?.text || "";
    }

    // Get input image from connected node (for image editing)
    let inputImage: string | undefined;
    const imgEdge = edgesAll.find((e) => e.target === id && e.targetHandle === "input_image");
    if (imgEdge) {
      const srcNode = nodes.find((n) => n.id === imgEdge.source);
      if (srcNode) {
        const sd = srcNode.data as any;
        const url = sd.widgetValues?._previewUrl || sd.widgetValues?._preview || sd.widgetValues?.portraitUrl;
        if (url) {
          if (url.startsWith("data:")) {
            inputImage = url.replace(/^data:image\/\w+;base64,/, "");
          } else {
            try {
              const resp = await fetch(url);
              const blob = await resp.blob();
              const dataUrl = await new Promise<string>((r) => { const rd = new FileReader(); rd.onloadend = () => r(rd.result as string); rd.readAsDataURL(blob); });
              inputImage = dataUrl.replace(/^data:image\/\w+;base64,/, "");
            } catch { /* skip */ }
          }
        }
      }
    }

    // Get reference images from connected ref nodes
    const referenceImages: string[] = [];
    for (let i = 0; i < refCount; i++) {
      const refEdge = edgesAll.find((e) => e.target === id && e.targetHandle === `ref_${i}`);
      if (!refEdge) continue;
      const srcNode = nodes.find((n) => n.id === refEdge.source);
      if (!srcNode) continue;
      const sd = srcNode.data as any;
      const url = sd.widgetValues?._previewUrl || sd.widgetValues?._preview || sd.widgetValues?.portraitUrl;
      if (!url) continue;
      if (url.startsWith("data:")) {
        referenceImages.push(url.replace(/^data:image\/\w+;base64,/, ""));
      } else {
        try {
          const resp = await fetch(url);
          const blob = await resp.blob();
          const dataUrl = await new Promise<string>((r) => { const rd = new FileReader(); rd.onloadend = () => r(rd.result as string); rd.readAsDataURL(blob); });
          referenceImages.push(dataUrl.replace(/^data:image\/\w+;base64,/, ""));
        } catch { /* skip */ }
      }
    }

    for (let i = 0; i < nRuns; i++) {
      if (nRuns > 1) setBatchInfo({ done: i, total: nRuns });
      const runSeed = nRuns > 1
        ? Math.floor(Math.random() * 2147483647)
        : (nodeData.widgetValues?.seed ? parseInt(nodeData.widgetValues.seed) : undefined);
      const result = await generateImage({
        prompt: prompt || "Generate an image",
        model: nodeData.widgetValues?.model || "gemini-2.5-flash-image",
        aspectRatio: nodeData.widgetValues?.aspectRatio || "1:1",
        seed: runSeed,
        temperature: nodeData.widgetValues?.temperature,
        numberOfImages: nodeData.widgetValues?.numImages || 1,
        inputImage,
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        safetySettings: {
          HARM_CATEGORY_HARASSMENT: nodeData.widgetValues?.safety_harassment || "BLOCK_MEDIUM_AND_ABOVE",
          HARM_CATEGORY_HATE_SPEECH: nodeData.widgetValues?.safety_hate || "BLOCK_MEDIUM_AND_ABOVE",
          HARM_CATEGORY_SEXUALLY_EXPLICIT: nodeData.widgetValues?.safety_sexual || "BLOCK_MEDIUM_AND_ABOVE",
          HARM_CATEGORY_DANGEROUS_CONTENT: nodeData.widgetValues?.safety_dangerous || "BLOCK_MEDIUM_AND_ABOVE",
        },
      });

      if (result.error) {
        setError(result.error);
        log("Generation error", { nodeId: id, nodeType: "fs:nanoBanana", nodeLabel: "Nano Banana", status: "error", details: result.error });
        console.error("[NanoBanana]", result.error);
        break;
      }
      if (result.images.length > 0) {
        const dataUrl = `data:image/png;base64,${result.images[0]}`;
        updateWidgetValue(id, "_previewUrl", dataUrlToBlobUrl(dataUrl));
        const prev = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues?._history || [];
        const { history: newHistory, index: newIdx } = await addToHistory(id, prev, dataUrl);
        updateWidgetValue(id, "_history", newHistory);
        updateWidgetValue(id, "_historyIndex", newIdx);
        log(`Image ready${nRuns > 1 ? ` (${i + 1}/${nRuns})` : ""}`, { nodeId: id, nodeType: "fs:nanoBanana", status: "success" });
        addGenerationToLibrary(dataUrl, {
          prompt: prompt || "",
          model: nodeData.widgetValues?.model || "gemini-2.5-flash-image",
          seed: String(runSeed ?? "random"),
          nodeType: "fs:nanoBanana",
        });
      }
    }
    setBatchInfo(null);
    useWorkflowStore.getState().saveProject();
    setGenerating(false);
  }, [id, edgesAll, nodes, nodeData.widgetValues, updateWidgetValue]);

  const randomizeSeed = useCallback(() => {
    updateWidgetValue(id, "seed", Math.floor(Math.random() * 2147483647).toString());
  }, [id, updateWidgetValue]);

  const addRef = useCallback(() => {
    if (refCount < MAX_REFS) {
      updateWidgetValue(id, "_refCount", refCount + 1);
    }
  }, [id, refCount, updateWidgetValue]);

  const removeRef = useCallback(() => {
    if (refCount > 1) {
      updateWidgetValue(id, "_refCount", refCount - 1);
    }
  }, [id, refCount, updateWidgetValue]);

  const promptHL = connectingDir === "source" && connectingType === "TEXT" ? "highlight" : "";
  const imageHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "*") ? "highlight" : "";

  const hasCompatible = connectingType ? (promptHL || imageHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  return (
    <div
      className={`nanob-node ${selected ? "selected" : ""} ${dimClass}`}
      onClick={() => setSelectedNode(id)}
    >
      <div className="nanob-node-inner">
        <div className="nanob-accent" />
        <div className="nanob-header">
          <span className="nanob-icon">🍌</span>
          <div className="nanob-header-text">
            <span className="nanob-title">Nano Banana</span>
            <span className="nanob-status">
              {generating
                ? (batchInfo ? `BATCH ${batchInfo.done + 1}/${batchInfo.total}` : "GENERATING...")
                : (count > 1 ? `READY · ×${count}` : "READY")}
            </span>
          </div>
        </div>
      </div>

      {/* Input handles */}
      <div className="nanob-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="prompt"
            className={`slot-handle ${promptHL} ${errorHandles.has("prompt") ? "handle-error" : ""}`}
            style={{ color: errorHandles.has("prompt") ? "#ff2020" : "#f0c040" }} />
          <TypeBadge color="#f0c040">TEXT</TypeBadge>
          <span className="nanob-input-label">Prompt</span>
        </div>
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="input_image"
            className={`slot-handle ${imageHL} ${errorHandles.has("input_image") ? "handle-error" : ""}`}
            style={{ color: errorHandles.has("input_image") ? "#ff2020" : "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMAGE</TypeBadge>
          <span className="nanob-input-label">Input Image</span>
        </div>

        {Array.from({ length: refCount }, (_, i) => (
          <div key={`ref_${i}`} className="nanob-input-row">
            <Handle type="target" position={Position.Left} id={`ref_${i}`}
              className={`slot-handle ${imageHL} ${errorHandles.has(`ref_${i}`) ? "handle-error" : ""}`}
              style={{ color: errorHandles.has(`ref_${i}`) ? "#ff2020" : "#64b5f6" }} />
            <TypeBadge color="#64b5f6">IMAGE</TypeBadge>
            <span className="nanob-input-label">Ref {i + 1}</span>
          </div>
        ))}

        {/* Add/Remove ref buttons */}
        <div className="nanob-ref-controls">
          {refCount < MAX_REFS && (
            <button className="nanob-ref-btn" onClick={addRef} title="Add reference">+</button>
          )}
          {refCount > 1 && (
            <button className="nanob-ref-btn nanob-ref-remove" onClick={removeRef} title="Remove reference">−</button>
          )}
          <span className="nanob-ref-count">{refCount}/{MAX_REFS}</span>
        </div>
      </div>

      {/* Preview with history */}
      <MediaHistory
        nodeId={id}
        history={nodeData.widgetValues?._history || []}
        historyIndex={nodeData.widgetValues?._historyIndex ?? -1}
        fallbackUrl={previewUrl}
        emptyIcon="🍌"
      />

      {/* Error message */}
      {error && (
        <div className="nanob-error nodrag">{error}</div>
      )}

      {/* Generate + Dice */}
      <div className="nanob-actions">
        <button
          className={`nanob-generate-btn ${generating ? "generating" : ""}data-fs-run-id={id} `}
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? "Generating..." : "▶  Generate"}
        </button>
        <button className="nanob-dice-btn" onClick={randomizeSeed} title="Random seed">
          🎲
        </button>
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
    <span
      className="type-badge"
      style={{
        color,
        borderColor: color + "66",
        backgroundColor: color + "12",
      }}
    >
      {children}
    </span>
  );
}

export default memo(NanoBananaNode);
