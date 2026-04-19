// ComfyUI server URL — empty = Vite proxy, or direct URL like "http://192.168.0.67:8188"
const COMFY_SERVER_KEY = "flowstudio_comfyui_server";

// Direct URL to the backend (must match vite.config.ts proxy target).
// Used when the user needs a real link (e.g. to open ComfyUI in a new tab)
// since an empty string would point at FlowStudio itself via the proxy.
export const DEFAULT_COMFY_DIRECT_URL = "http://192.168.0.67:8188";

/** Get the URL for API calls (empty = Vite proxy, which only works from inside the app). */
export function getComfyUrl(): string {
  return localStorage.getItem(COMFY_SERVER_KEY) || "";
}

/** Get a direct (non-proxy) URL safe to open in a new tab. */
export function getComfyDirectUrl(): string {
  const stored = localStorage.getItem(COMFY_SERVER_KEY);
  if (stored) return stored;
  return DEFAULT_COMFY_DIRECT_URL;
}

export function setComfyUrl(url: string) {
  if (url) {
    localStorage.setItem(COMFY_SERVER_KEY, url.replace(/\/$/, ""));
  } else {
    localStorage.removeItem(COMFY_SERVER_KEY);
  }
}

// ── Types ──────────────────────────────────────────────────────────
export interface ComfyNodeDef {
  name: string;
  display_name: string;
  category: string;
  description: string;
  input: {
    required?: Record<string, any>;
    optional?: Record<string, any>;
  };
  output: string[];
  output_name: string[];
}

export interface QueuePromptResult {
  prompt_id: string;
}

// ── Fetch all node definitions ─────────────────────────────────────
export async function fetchNodeDefs(): Promise<Record<string, ComfyNodeDef>> {
  const res = await fetch(`${getComfyUrl()}/api/object_info`);
  if (!res.ok) throw new Error(`Failed to fetch nodes: ${res.status}`);
  return res.json();
}

// ── Queue a workflow prompt ────────────────────────────────────────
export async function queuePrompt(workflow: Record<string, any>): Promise<QueuePromptResult> {
  const res = await fetch(`${getComfyUrl()}/api/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error(`[ComfyUI] Queue error ${res.status}:`, errBody);
    throw new Error(`ComfyUI ${res.status}: ${errBody.slice(0, 200)}`);
  }
  return res.json();
}

// ── Get generated image URL ────────────────────────────────────────
export function getImageUrl(filename: string, subfolder: string = "", type: string = "output"): string {
  return `${getComfyUrl()}/api/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${type}`;
}

// ── Upload image to ComfyUI (returns filename) ───────────────────
export async function uploadImage(dataUrl: string, filename?: string): Promise<string> {
  // Convert data URL to blob
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const name = filename || `fs_upload_${Date.now()}.png`;

  const formData = new FormData();
  formData.append("image", blob, name);
  formData.append("overwrite", "true");

  const uploadRes = await fetch(`${getComfyUrl()}/api/upload/image`, {
    method: "POST",
    body: formData,
  });

  if (!uploadRes.ok) {
    throw new Error(`Upload failed: ${uploadRes.status}`);
  }

  const data = await uploadRes.json();
  return data.name; // filename in ComfyUI input folder
}

// ── WebSocket for progress ─────────────────────────────────────────
export function connectWebSocket(onMessage: (data: any) => void): WebSocket {
  const comfyUrl = getComfyUrl();
  let wsUrl: string;
  if (comfyUrl) {
    // Direct connection to ComfyUI server
    const url = new URL(comfyUrl);
    const wsProto = url.protocol === "https:" ? "wss:" : "ws:";
    wsUrl = `${wsProto}//${url.host}/ws?clientId=comfy-react-ui`;
  } else {
    // Via Vite proxy
    const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
    wsUrl = `${wsProto}//${location.host}/ws?clientId=comfy-react-ui`;
  }
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch {
      // binary data (preview images), skip
    }
  };

  ws.onerror = (err) => console.error("[WS] Error:", err);
  ws.onclose = () => {
    console.log("[WS] Disconnected, reconnecting in 2s...");
    setTimeout(() => connectWebSocket(onMessage), 2000);
  };

  return ws;
}

// ── Interrupt current generation ───────────────────────────────────
export async function interruptGeneration(): Promise<void> {
  await fetch(`${getComfyUrl()}/api/interrupt`, { method: "POST" });
}

// ── Get queue status ───────────────────────────────────────────────
export async function getQueueStatus(): Promise<{ queue_running: any[]; queue_pending: any[] }> {
  const res = await fetch(`${getComfyUrl()}/api/queue`);
  return res.json();
}
