// TikTok Content Posting API v2
import { getApiKey } from "../components/SettingsModal";

const TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_POST_URL = "https://open.tiktokapis.com/v2/post/publish/content/init/";
const TIKTOK_STATUS_URL = "https://open.tiktokapis.com/v2/post/publish/status/fetch/";

const TOKEN_STORAGE_KEY = "flowstudio_tiktok_token";

interface TikTokToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

// ── Token Management ────────────────────────────────────────────

export function getTikTokToken(): TikTokToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function saveTikTokToken(token: TikTokToken): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
}

export function isTokenValid(): boolean {
  const token = getTikTokToken();
  if (!token) return false;
  return Date.now() < token.expires_at;
}

// ── OAuth Flow ──────────────────────────────────────────────────

export function startTikTokAuth(): void {
  const clientKey = getApiKey("tiktok_client_key");
  if (!clientKey) {
    alert("TikTok Client Key not set. Go to Settings.");
    return;
  }

  // Generate CSRF state
  const state = Math.random().toString(36).slice(2, 12);
  localStorage.setItem("tiktok_oauth_state", state);

  // Redirect URL — hosted on GitHub Pages (TikTok requires HTTPS)
  const redirectUri = "https://ka4ok424.github.io/flowstudio-legal/tiktok-callback/";

  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: "code",
    scope: "video.upload,video.publish",
    redirect_uri: redirectUri,
    state,
  });

  // Open in popup
  window.open(
    `${TIKTOK_AUTH_URL}?${params.toString()}`,
    "TikTok Login",
    "width=600,height=700"
  );

  // Listen for callback via postMessage from GitHub Pages callback page
  const handler = (event: MessageEvent) => {
    if (event.data?.type !== "tiktok-auth") return;
    window.removeEventListener("message", handler);

    try {
      const callbackUrl = new URL(event.data.url);
      const code = callbackUrl.searchParams.get("code");
      const returnedState = callbackUrl.searchParams.get("state");

      if (returnedState !== localStorage.getItem("tiktok_oauth_state")) {
        console.error("[TikTok] CSRF state mismatch");
        return;
      }
      if (code) {
        exchangeCodeForToken(code, redirectUri);
      }
    } catch (e) {
      console.error("[TikTok] Failed to parse callback:", e);
    }
  };
  window.addEventListener("message", handler);
}

async function exchangeCodeForToken(code: string, redirectUri: string): Promise<void> {
  const clientKey = getApiKey("tiktok_client_key");
  const clientSecret = getApiKey("tiktok_client_secret");

  try {
    const res = await fetch(TIKTOK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    const data = await res.json();
    if (data.access_token) {
      saveTikTokToken({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in || 86400) * 1000,
      });
      console.log("[TikTok] Authenticated successfully");
    } else {
      console.error("[TikTok] Token exchange failed:", data);
    }
  } catch (err) {
    console.error("[TikTok] Token exchange error:", err);
  }
}

// ── Publish Video ───────────────────────────────────────────────

export interface PublishOptions {
  videoUrl: string; // Public URL to video file
  title: string;
  privacy: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY";
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  brandContent?: boolean;
}

export interface PublishResult {
  publishId?: string;
  error?: string;
}

export async function publishVideoByUrl(options: PublishOptions): Promise<PublishResult> {
  const token = getTikTokToken();
  if (!token) return { error: "Not authenticated. Click 'Connect TikTok' first." };

  try {
    const res = await fetch(TIKTOK_POST_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        post_info: {
          title: options.title.slice(0, 2200),
          privacy_level: options.privacy,
          disable_comment: options.disableComment || false,
          disable_duet: options.disableDuet || false,
          disable_stitch: options.disableStitch || false,
          brand_content_toggle: options.brandContent || false,
          brand_organic_toggle: false,
          is_ai_generated: true, // Required disclosure for AI content
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: options.videoUrl,
        },
      }),
    });

    const data = await res.json();
    if (data.data?.publish_id) {
      return { publishId: data.data.publish_id };
    }
    return { error: data.error?.message || "Publish failed" };
  } catch (err: any) {
    return { error: `Network error: ${err.message}` };
  }
}

export async function checkPublishStatus(publishId: string): Promise<{ status: string; error?: string }> {
  const token = getTikTokToken();
  if (!token) return { status: "error", error: "Not authenticated" };

  try {
    const res = await fetch(TIKTOK_STATUS_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ publish_id: publishId }),
    });

    const data = await res.json();
    return {
      status: data.data?.status || "unknown",
      error: data.data?.fail_reason,
    };
  } catch (err: any) {
    return { status: "error", error: err.message };
  }
}
