// ComfyUI server URL — empty = Vite proxy, or direct URL like "http://192.168.31.235:8188"
const COMFY_SERVER_KEY = "flowstudio_comfyui_server";

// Direct URL to the backend (must match vite.config.ts proxy target).
// Used when the user needs a real link (e.g. to open ComfyUI in a new tab)
// since an empty string would point at FlowStudio itself via the proxy.
// LAN IP works for both the previous Windows ComfyUI and the current Linux ComfyUI
// running on the same box. (mDNS desktop-6mltn1b.local doesn't resolve from this Mac.)
export const DEFAULT_COMFY_DIRECT_URL = "http://192.168.31.235:8188";

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

// Stable per-tab client identifier. ComfyUI uses this to track which client
// owns the running prompt — without it, some custom nodes (notably KJNodes'
// LTX2 preview override) crash because PromptServer.last_node_id stays None.
//
// crypto.randomUUID is only exposed in secure contexts (https / localhost) —
// accessing FlowStudio over Tailscale (http://100.x.x.x) leaves it undefined,
// so we fall back to a non-cryptographic but unique-enough ID.
let _clientId: string | null = null;
export function getClientId(): string {
  if (_clientId) return _clientId;
  const c: any = typeof crypto !== "undefined" ? crypto : null;
  let uuid: string;
  if (c && typeof c.randomUUID === "function") {
    uuid = c.randomUUID();
  } else {
    uuid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  _clientId = `flowstudio-${uuid}`;
  return _clientId;
}

// ── Queue a workflow prompt ────────────────────────────────────────
export async function queuePrompt(workflow: Record<string, any>): Promise<QueuePromptResult> {
  const res = await fetch(`${getComfyUrl()}/api/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: getClientId() }),
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

// ── Content-hash deduplicated upload ───────────────────────────────
// Two-level cache: (a) by sourceUrl so repeat reads of the same blob/URL in
// one session are free, (b) by SHA-256 so two different sources with the
// same bytes (e.g., same image imported into two Import nodes) only upload
// once. The `fs_<hash>` naming is stable across sessions — a HEAD check
// against /api/view skips the upload entirely if ComfyUI still has the file
// in input/ from a previous session.
const _uploadByUrl = new Map<string, string>();
const _uploadByHash = new Map<string, string>();

/**
 * 16-char content hash. Uses SHA-256 in secure contexts (https / localhost);
 * falls back to a pure-JS combo of FNV-1a + DJB2 over Tailscale / plain HTTP
 * where `crypto.subtle` is undefined. Both produce a stable hex string of
 * the same length, so `fs_<hash16>.<ext>` filenames stay collision-resistant
 * enough for content deduplication (32 bits × 2 ≈ 1.8e19 of effective space).
 * Cross-context note: SHA-256 and the fallback yield different hashes for
 * the same bytes — opening FlowStudio over both LAN and Tailscale will
 * occasionally double-upload a file. Acceptable trade-off vs. shipping a
 * pure-JS SHA-256 implementation.
 */
async function _sha256Hex(buf: ArrayBuffer): Promise<string> {
  const subtle = typeof crypto !== "undefined" ? (crypto as any).subtle : undefined;
  if (subtle && typeof subtle.digest === "function") {
    try {
      const h = await subtle.digest("SHA-256", buf);
      return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
    } catch { /* some browsers throw here too — fall through */ }
  }
  const bytes = new Uint8Array(buf);
  let h1 = 0x811c9dc5;                                 // FNV-1a offset basis
  let h2 = 5381;                                       // DJB2 seed
  for (let i = 0; i < bytes.length; i++) {
    h1 ^= bytes[i];
    h1 = Math.imul(h1, 0x01000193);                    // FNV prime
    h2 = ((h2 << 5) + h2 + bytes[i]) | 0;              // DJB2 step
  }
  return (h1 >>> 0).toString(16).padStart(8, "0")
       + (h2 >>> 0).toString(16).padStart(8, "0");
}

function _filenameFromComfyView(url: string, type: "input" | "output" | "temp"): string | null {
  try {
    const u = new URL(url, "http://x");                                  // base for relative URLs
    if (!u.pathname.endsWith("/api/view")) return null;
    if (u.searchParams.get("type") !== type) return null;
    const fn = u.searchParams.get("filename");
    return fn || null;
  } catch { return null; }
}

/**
 * Upload media to ComfyUI input/ exactly once per content hash.
 *
 * Fast path:
 *  - sourceUrl already in ComfyUI input/   → return its filename, no IO
 *  - same sourceUrl seen this session       → return cached filename
 *  - same content hash seen this session    → return cached filename
 *  - file already on server (HEAD 200)      → skip upload, cache + return
 *
 * Slow path: download bytes → hash → upload with `fs_<hash16>.<ext>` name.
 *
 * `ext` is just the on-server filename suffix; ComfyUI's LoadImage sniffs the
 * real format via PIL so a JPG named .png still loads fine. Stick with png/wav
 * unless the caller has a strong preference.
 */
export async function uploadOnce(sourceUrl: string, ext: string = "png"): Promise<string> {
  if (!sourceUrl) throw new Error("uploadOnce: empty sourceUrl");

  const cached = _uploadByUrl.get(sourceUrl);
  if (cached) return cached;

  // Already on ComfyUI input/ — just use its name (no network).
  const existing = _filenameFromComfyView(sourceUrl, "input");
  if (existing) {
    _uploadByUrl.set(sourceUrl, existing);
    return existing;
  }

  // Download bytes (handles blob:, data:, http://, /api/view?type=output etc.)
  const resp = await fetch(sourceUrl);
  if (!resp.ok) throw new Error(`uploadOnce: source fetch ${resp.status}`);
  const buf = await resp.arrayBuffer();
  if (buf.byteLength === 0) throw new Error("uploadOnce: source is empty");

  const hash = await _sha256Hex(buf);

  const byHash = _uploadByHash.get(hash);
  if (byHash) {
    _uploadByUrl.set(sourceUrl, byHash);
    return byHash;
  }

  const filename = `fs_${hash.slice(0, 16)}.${ext}`;

  // HEAD probe — file may already be in input/ from a previous session.
  try {
    const head = await fetch(
      `${getComfyUrl()}/api/view?filename=${encodeURIComponent(filename)}&type=input`,
      { method: "HEAD" },
    );
    if (head.ok) {
      _uploadByUrl.set(sourceUrl, filename);
      _uploadByHash.set(hash, filename);
      return filename;
    }
  } catch { /* network blip — fall through to real upload */ }

  // Actual upload
  const form = new FormData();
  form.append("image", new Blob([buf]), filename);
  form.append("overwrite", "true");
  const up = await fetch(`${getComfyUrl()}/api/upload/image`, { method: "POST", body: form });
  if (!up.ok) throw new Error(`uploadOnce: upload ${up.status}`);
  const data = await up.json();
  const name: string = data.name;

  _uploadByUrl.set(sourceUrl, name);
  _uploadByHash.set(hash, name);
  return name;
}

/** Construct the ComfyUI /api/view URL that maps back to an input/ filename. */
export function inputFileUrl(filename: string): string {
  return `${getComfyUrl()}/api/view?filename=${encodeURIComponent(filename)}&type=input`;
}

// ── WebSocket for progress ─────────────────────────────────────────
export function connectWebSocket(onMessage: (data: any) => void): WebSocket {
  const comfyUrl = getComfyUrl();
  // MUST match the client_id used in /api/prompt — ComfyUI routes progress
  // events only to the websocket whose clientId matches the queued prompt's
  // client_id. If they differ, the top progress bar stays empty.
  const cid = encodeURIComponent(getClientId());
  let wsUrl: string;
  if (comfyUrl) {
    // Direct connection to ComfyUI server
    const url = new URL(comfyUrl);
    const wsProto = url.protocol === "https:" ? "wss:" : "ws:";
    wsUrl = `${wsProto}//${url.host}/ws?clientId=${cid}`;
  } else {
    // Via Vite proxy
    const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
    wsUrl = `${wsProto}//${location.host}/ws?clientId=${cid}`;
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

// ── Clear all pending prompts in the queue ─────────────────────────
export async function clearQueue(): Promise<void> {
  await fetch(`${getComfyUrl()}/api/queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clear: true }),
  });
}

// ── Full stop: drop pending queue AND kill the running prompt ──────
// Without clearQueue first, interrupt only kills the current prompt
// and the next pending one starts immediately, masking the stop.
export async function stopAll(): Promise<void> {
  await Promise.all([clearQueue(), interruptGeneration()]);
}

// ── Get queue status ───────────────────────────────────────────────
export async function getQueueStatus(): Promise<{ queue_running: any[]; queue_pending: any[] }> {
  const res = await fetch(`${getComfyUrl()}/api/queue`);
  return res.json();
}
