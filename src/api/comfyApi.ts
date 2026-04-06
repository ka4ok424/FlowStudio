// Uses Vite proxy — requests go to localhost:3000 → forwarded to ComfyUI 8188
const COMFY_URL = "";

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
  const res = await fetch(`${COMFY_URL}/api/object_info`);
  if (!res.ok) throw new Error(`Failed to fetch nodes: ${res.status}`);
  return res.json();
}

// ── Queue a workflow prompt ────────────────────────────────────────
export async function queuePrompt(workflow: Record<string, any>): Promise<QueuePromptResult> {
  const res = await fetch(`${COMFY_URL}/api/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!res.ok) throw new Error(`Failed to queue: ${res.status}`);
  return res.json();
}

// ── Get generated image URL ────────────────────────────────────────
export function getImageUrl(filename: string, subfolder: string = "", type: string = "output"): string {
  return `${COMFY_URL}/api/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${type}`;
}

// ── WebSocket for progress ─────────────────────────────────────────
export function connectWebSocket(onMessage: (data: any) => void): WebSocket {
  const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${wsProto}//${location.host}/ws?clientId=comfy-react-ui`);

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

// ── Get queue status ───────────────────────────────────────────────
export async function getQueueStatus(): Promise<{ queue_running: any[]; queue_pending: any[] }> {
  const res = await fetch(`${COMFY_URL}/api/queue`);
  return res.json();
}
