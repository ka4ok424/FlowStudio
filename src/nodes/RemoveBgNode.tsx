import { memo, useCallback, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt, getImageUrl, uploadImage, getComfyUrl } from "../api/comfyApi";
import { addGenerationToLibrary } from "../store/mediaStore";
import MediaHistory from "./MediaHistory";
import { addToHistory } from "../utils/historyLimit";
import { log } from "../store/logStore";

const MODELS = [
  { value: "BiRefNet-general", label: "General (balanced)", desc: "Best overall quality, 1024px" },
  { value: "BiRefNet-portrait", label: "Portrait", desc: "People, hair, skin — cleanest edges" },
  { value: "BiRefNet-HR", label: "High-Res", desc: "Up to 2560px, maximum detail" },
  { value: "BiRefNet_toonout", label: "Cartoon / 3D", desc: "For stylized, CG, Pixar-style" },
  { value: "BiRefNet-matting", label: "Matting", desc: "Semi-transparent edges, glass, fur" },
  { value: "BiRefNet-HR-matting", label: "HR Matting", desc: "High-res + transparent edges" },
  { value: "BiRefNet_dynamic", label: "Dynamic", desc: "Any resolution, most robust" },
  { value: "BiRefNet_lite", label: "Lite (fast)", desc: "Quick preview, lower quality" },
];

function RemoveBgNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const nodesAll = useWorkflowStore((s) => s.nodes);
  const edgesAll = useWorkflowStore((s) => s.edges);

  const previewUrl = nodeData.widgetValues?._previewUrl || null;
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRemove = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    setError(null);
    const startTime = Date.now();
    log("Remove BG started", { nodeId: id, nodeType: "fs:removeBg", nodeLabel: "Remove BG" });

    const freshWv = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues || {};
    const model = freshWv.model || "BiRefNet-general";

    const imgEdge = edgesAll.find((edge) => edge.target === id && edge.targetHandle === "input");
    if (!imgEdge) { setError("Connect an image"); setProcessing(false); return; }
    const srcNode = nodesAll.find((n) => n.id === imgEdge.source);
    if (!srcNode) { setError("Source not found"); setProcessing(false); return; }
    const sd = srcNode.data as any;
    const srcUrl = sd.widgetValues?._previewUrl || sd.widgetValues?._preview || sd.widgetValues?.portraitUrl;
    if (!srcUrl) { setError("No image in source"); setProcessing(false); return; }

    try {
      const fileName = `fs_rmbg_${imgEdge.source}.png`;
      let imgName: string;
      if (srcUrl.startsWith("data:")) {
        imgName = await uploadImage(srcUrl, fileName);
      } else {
        const resp = await fetch(srcUrl);
        const blob = await resp.blob();
        const dataUrl = await new Promise<string>((r) => { const rd = new FileReader(); rd.onloadend = () => r(rd.result as string); rd.readAsDataURL(blob); });
        imgName = await uploadImage(dataUrl, fileName);
      }

      const workflow = {
        "1": { class_type: "LoadImage", inputs: { image: imgName } },
        "2": { class_type: "BiRefNetRMBG", inputs: { image: ["1", 0], model: model, mask_blur: 0, mask_offset: 0, invert_output: false, refine_foreground: true, background: "Alpha", background_color: "#222222" } },
        "3": { class_type: "SaveImage", inputs: { images: ["2", 0], filename_prefix: `FS_RMBG_${Date.now()}` } },
      };

      const result = await queuePrompt(workflow);
      const promptId = result.prompt_id;

      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
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
                const resp = await fetch(apiUrl);
                const blob = await resp.blob();
                const dataUrl = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result as string); reader.readAsDataURL(blob); });

                updateWidgetValue(id, "_genTime", Date.now() - startTime);
                updateWidgetValue(id, "_previewUrl", dataUrl);
                const prevHist: string[] = (useWorkflowStore.getState().nodes.find(n => n.id === id)?.data as any)?.widgetValues?._history || [];
                const { history: newHist, index: newIdx } = await addToHistory(id, prevHist, dataUrl);
                updateWidgetValue(id, "_history", newHist);
                updateWidgetValue(id, "_historyIndex", newIdx);
                log("Remove BG complete", { nodeId: id, nodeType: "fs:removeBg", nodeLabel: "Remove BG", status: "success", details: model });
                addGenerationToLibrary(dataUrl, { prompt: `Remove BG (${model})`, model, seed: "n/a", nodeType: "fs:removeBg", duration: Date.now() - startTime });
                setProcessing(false);
                return;
              }
            }
            const st = history[promptId].status;
            if (st?.completed || st?.status_str === "error") {
              const errMsg = history[promptId].status?.messages?.find((m: any) => m[0] === "execution_error");
              setError(errMsg ? errMsg[1]?.exception_message?.slice(0, 120) : "Remove BG failed");
              setProcessing(false);
              return;
            }
          }
        } catch { /* keep polling */ }
      }
      setError("Timeout"); setProcessing(false);
    } catch (err: any) {
      setError(err.message); setProcessing(false);
    }
  }, [id, edgesAll, nodesAll, updateWidgetValue]);

  const imgHL = connectingDir === "source" && (connectingType === "IMAGE" || connectingType === "MEDIA" || connectingType === "*") ? "highlight" : "";
  const outputHL = connectingDir === "target" && (connectingType === "IMAGE" || connectingType === "*") ? "highlight" : "";
  const hasCompatible = connectingType ? !!(imgHL || outputHL) : false;
  const dimClass = connectingType ? (hasCompatible ? "compatible" : "incompatible") : "";

  const currentModel = MODELS.find(m => m.value === (nodeData.widgetValues?.model || "BiRefNet"));

  return (
    <div className={`removebg-node ${selected ? "selected" : ""} ${dimClass}`} onClick={() => setSelectedNode(id)}>
      <div className="removebg-node-inner">
        <div className="removebg-accent" />
        <div className="removebg-header">
          <span className="removebg-icon">✂️</span>
          <div className="removebg-header-text">
            <span className="removebg-title">Remove BG</span>
            <span className="removebg-status">{processing ? "PROCESSING..." : currentModel?.label || "BiRefNet"}</span>
          </div>
        </div>
      </div>

      <div className="removebg-inputs">
        <div className="nanob-input-row">
          <Handle type="target" position={Position.Left} id="input" className={`slot-handle ${imgHL}`} style={{ color: "#64b5f6" }} />
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-input-label">Image</span>
        </div>
      </div>

      <MediaHistory nodeId={id} history={nodeData.widgetValues?._history || []} historyIndex={nodeData.widgetValues?._historyIndex ?? -1} fallbackUrl={previewUrl} emptyIcon="✂️" genTime={nodeData.widgetValues?._genTime} />

      {error && <div className="nanob-error nodrag">{error}</div>}

      <div className="nanob-actions">
        <button className={`localgen-generate-btn ${processing ? "generating" : ""}`} onClick={handleRemove} disabled={processing}>
          {processing ? "Removing..." : "✂️ Remove Background"}
        </button>
      </div>

      <div className="removebg-outputs">
        <div className="nanob-input-row" style={{ justifyContent: "flex-end" }}>
          <TypeBadge color="#64b5f6">IMG</TypeBadge>
          <span className="nanob-output-label">Image</span>
          <Handle type="source" position={Position.Right} id="output_0" className={`slot-handle ${outputHL}`} style={{ color: "#64b5f6" }} />
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="type-badge" style={{ color, borderColor: color + "66", backgroundColor: color + "12" }}>{children}</span>;
}

export default memo(RemoveBgNode);
