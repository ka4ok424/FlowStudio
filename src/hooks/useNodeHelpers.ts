import { uploadImage, getComfyUrl, getImageUrl, queuePrompt } from "../api/comfyApi";
import { useWorkflowStore } from "../store/workflowStore";
import { addGenerationToLibrary } from "../store/mediaStore";
import { addToHistory } from "../utils/historyLimit";
import { log } from "../store/logStore";

/** Upload image from data URL or API URL to ComfyUI. Returns filename. */
export async function uploadSourceImage(url: string, fileName: string): Promise<string> {
  if (url.startsWith("data:")) {
    return uploadImage(url, fileName);
  }
  const resp = await fetch(url);
  const blob = await resp.blob();
  const dataUrl = await new Promise<string>((r) => {
    const rd = new FileReader();
    rd.onloadend = () => r(rd.result as string);
    rd.readAsDataURL(blob);
  });
  return uploadImage(dataUrl, fileName);
}

/** Fetch image from ComfyUI API URL and convert to data URL */
export async function fetchAsDataUrl(apiUrl: string): Promise<string> {
  const resp = await fetch(apiUrl);
  const blob = await resp.blob();
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

/** Get preview URL from a connected node */
export function getConnectedImageUrl(
  nodeId: string,
  handleId: string,
  nodes: any[],
  edges: any[]
): string | null {
  const edge = edges.find((e: any) => e.target === nodeId && e.targetHandle === handleId);
  if (!edge) return null;
  const src = nodes.find((n: any) => n.id === edge.source);
  if (!src) return null;
  const sd = src.data as any;
  return sd.widgetValues?._previewUrl || sd.widgetValues?._preview || sd.widgetValues?.portraitUrl || null;
}

/** Get prompt text from connected Prompt node */
export function getConnectedPrompt(
  nodeId: string,
  nodes: any[],
  edges: any[]
): string {
  const edge = edges.find((e: any) => e.target === nodeId && e.targetHandle === "prompt");
  if (!edge) return "";
  const src = nodes.find((n: any) => n.id === edge.source);
  if (!src) return "";
  return (src.data as any).widgetValues?.text || "";
}

/** Poll ComfyUI history for prompt result. Returns first image/video output. */
export async function pollForResult(
  promptId: string,
  opts: {
    maxAttempts?: number;
    interval?: number;
    abortRef?: { current: boolean };
    mediaTypes?: string[];
  } = {}
): Promise<{ apiUrl: string; filename: string; type: string } | { error: string } | null> {
  const maxAttempts = opts.maxAttempts || 300;
  const interval = opts.interval || 1500;
  const mediaTypes = opts.mediaTypes || ["images", "videos", "gifs", "animated"];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (opts.abortRef?.current) return { error: "Stopped" };
    await new Promise((resolve) => setTimeout(resolve, interval));
    try {
      const res = await fetch(`${getComfyUrl()}/api/history/${promptId}`);
      if (!res.ok) continue;
      const history = await res.json();
      if (!history[promptId]) continue;

      const outputs = history[promptId].outputs;
      for (const nId of Object.keys(outputs || {})) {
        for (const mediaKey of mediaTypes) {
          const media = outputs[nId]?.[mediaKey];
          if (media && media.length > 0) {
            const item = media[0];
            return {
              apiUrl: getImageUrl(item.filename, item.subfolder, item.type),
              filename: item.filename,
              type: mediaKey,
            };
          }
        }
      }

      const st = history[promptId].status;
      if (st?.status_str === "error") {
        const errMsg = st.messages?.find((m: any) => m[0] === "execution_error");
        return { error: errMsg ? errMsg[1]?.exception_message?.slice(0, 120) : "Generation failed" };
      }
      if (st?.completed) continue;
    } catch { /* keep polling */ }
  }
  return { error: "Timeout" };
}

/** Save generation result to node preview + history + media library */
export async function saveGenerationResult(
  nodeId: string,
  dataUrl: string,
  genTime: number,
  meta: {
    prompt: string;
    model: string;
    seed: string;
    steps?: number;
    cfg?: number;
    width?: number;
    height?: number;
    nodeType: string;
    duration?: number;
  },
  mediaType: "image" | "video" | "audio" = "image"
) {
  const store = useWorkflowStore.getState();
  store.updateWidgetValue(nodeId, "_genTime", genTime);
  store.updateWidgetValue(nodeId, "_previewUrl", dataUrl);

  const prevHist: string[] = (store.nodes.find(n => n.id === nodeId)?.data as any)?.widgetValues?._history || [];
  const { history: newHist, index: newIdx } = await addToHistory(nodeId, prevHist, dataUrl);
  store.updateWidgetValue(nodeId, "_history", newHist);
  store.updateWidgetValue(nodeId, "_historyIndex", newIdx);

  addGenerationToLibrary(dataUrl, { ...meta, duration: meta.duration || genTime }, mediaType);
}
