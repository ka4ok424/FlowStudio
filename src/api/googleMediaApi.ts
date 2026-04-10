// Google AI API helpers for Veo (video), Imagen (images), Lyria (music), TTS
import { getApiKey } from "../components/SettingsModal";

const API_URL = "https://generativelanguage.googleapis.com/v1beta";

// ── Veo (Video Generation) ────────────────────────────────────────

export interface VeoOptions {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  inputImage?: string; // base64 for first frame (image-to-video)
  inputImageMime?: string;
  // Extended params (Veo 3/3.1)
  lastFrame?: string; // base64 for last frame (interpolation)
  referenceImages?: Array<{ image: { bytesBase64Encoded: string }; referenceType: string }>; // up to 3, Veo 3.1 only
  negativePrompt?: string;
  durationSeconds?: number; // 4, 6, 8
  resolution?: string; // "720p", "1080p", "4k"
  seed?: number;
  numberOfVideos?: number; // 1-4
}

export interface VeoResult {
  videoUrl?: string;
  videoBase64?: string;
  error?: string;
}

/** Start async video generation. Returns operation name for polling. */
export async function startVideoGeneration(options: VeoOptions): Promise<{ operationName?: string; error?: string }> {
  const apiKey = getApiKey("google");
  if (!apiKey) return { error: "Google API key not set. Go to Settings." };

  const model = options.model || "veo-3.0-fast-generate-001";
  const url = `${API_URL}/models/${model}:predictLongRunning?key=${apiKey}`;

  const instance: any = { prompt: options.prompt };

  // First frame (image-to-video)
  if (options.inputImage) {
    instance.image = {
      bytesBase64Encoded: options.inputImage,
      mimeType: options.inputImageMime || "image/png",
    };
  }

  // Last frame (interpolation, requires first frame too)
  if (options.lastFrame) {
    instance.lastFrame = {
      bytesBase64Encoded: options.lastFrame,
      mimeType: "image/png",
    };
  }

  // Reference images (Veo 3.1 only, up to 3)
  if (options.referenceImages && options.referenceImages.length > 0) {
    instance.referenceImages = options.referenceImages;
  }

  const parameters: any = {
    aspectRatio: options.aspectRatio || "16:9",
    personGeneration: "allow_adult",
  };

  if (options.negativePrompt) parameters.negativePrompt = options.negativePrompt;
  if (options.durationSeconds) parameters.durationSeconds = options.durationSeconds;
  if (options.resolution) parameters.resolution = options.resolution;
  if (options.seed !== undefined) parameters.seed = options.seed;
  if (options.numberOfVideos && options.numberOfVideos > 1) parameters.numberOfVideos = options.numberOfVideos;

  const body = {
    instances: [instance],
    parameters,
  };

  try {
    console.log(`[Veo] Starting generation with ${model}...`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: `API error ${res.status}: ${err.error?.message || res.statusText}` };
    }

    const data = await res.json();
    return { operationName: data.name };
  } catch (err: any) {
    return { error: `Network error: ${err.message}` };
  }
}

/** Poll operation status. Returns result when done. */
export async function pollOperation(operationName: string): Promise<{ done: boolean; result?: VeoResult; error?: string }> {
  const apiKey = getApiKey("google");
  if (!apiKey) return { done: true, error: "No API key" };

  const url = `${API_URL}/${operationName}?key=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { done: true, error: `Poll error ${res.status}: ${err.error?.message || res.statusText}` };
    }

    const data = await res.json();

    if (!data.done) return { done: false };

    console.log("[Veo] Operation complete, response:", JSON.stringify(data).slice(0, 500));

    // Extract video from response
    if (data.error) {
      return { done: true, error: data.error.message || "Generation failed" };
    }

    const response = data.response;
    if (response?.generateVideoResponse?.generatedSamples) {
      const sample = response.generateVideoResponse.generatedSamples[0];
      if (sample?.video?.uri) {
        // Append API key to download URI
        const sep = sample.video.uri.includes("?") ? "&" : "?";
        const downloadUrl = `${sample.video.uri}${sep}key=${apiKey}`;
        return { done: true, result: { videoUrl: downloadUrl } };
      }
    }

    // Try alternative response format
    if (response?.predictions) {
      const pred = response.predictions[0];
      if (pred?.bytesBase64Encoded) {
        return { done: true, result: { videoBase64: pred.bytesBase64Encoded } };
      }
    }

    return { done: true, error: "No video in response" };
  } catch (err: any) {
    return { done: true, error: `Network error: ${err.message}` };
  }
}

// ── Imagen (Image Generation) ─────────────────────────────────────

export interface ImagenOptions {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  sampleCount?: number;
}

export interface ImagenResult {
  images: string[]; // base64
  error?: string;
}

export async function generateImagen(options: ImagenOptions): Promise<ImagenResult> {
  const apiKey = getApiKey("google");
  if (!apiKey) return { images: [], error: "Google API key not set." };

  const model = options.model || "imagen-4.0-generate-001";
  const url = `${API_URL}/models/${model}:predict?key=${apiKey}`;

  const body = {
    instances: [{ prompt: options.prompt }],
    parameters: {
      sampleCount: options.sampleCount || 1,
      aspectRatio: options.aspectRatio || "1:1",
    },
  };

  try {
    console.log(`[Imagen] Generating with ${model}...`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { images: [], error: `API error ${res.status}: ${err.error?.message || res.statusText}` };
    }

    const data = await res.json();
    const images = (data.predictions || [])
      .filter((p: any) => p.bytesBase64Encoded)
      .map((p: any) => p.bytesBase64Encoded);

    return { images };
  } catch (err: any) {
    return { images: [], error: `Network error: ${err.message}` };
  }
}

// ── Lyria (Music Generation) ──────────────────────────────────────

export interface LyriaOptions {
  prompt: string;
  model?: string;
}

export interface LyriaResult {
  audioBase64?: string;
  error?: string;
}

export async function generateMusic(options: LyriaOptions): Promise<LyriaResult> {
  const apiKey = getApiKey("google");
  if (!apiKey) return { error: "Google API key not set." };

  const model = options.model || "lyria-3-clip-preview";
  const url = `${API_URL}/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: options.prompt }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
    },
  };

  try {
    console.log(`[Lyria] Generating music with ${model}...`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: `API error ${res.status}: ${err.error?.message || res.statusText}` };
    }

    const data = await res.json();
    const audioPart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inline_data?.data);
    if (audioPart) {
      return { audioBase64: audioPart.inline_data.data };
    }
    return { error: "No audio in response" };
  } catch (err: any) {
    return { error: `Network error: ${err.message}` };
  }
}

// ── TTS (Text-to-Speech) ──────────────────────────────────────────

export interface TtsOptions {
  text: string;
  model?: string;
  voiceName?: string;
}

export interface TtsResult {
  audioBase64?: string;
  error?: string;
}

export async function generateTts(options: TtsOptions): Promise<TtsResult> {
  const apiKey = getApiKey("google");
  if (!apiKey) return { error: "Google API key not set." };

  const model = options.model || "gemini-2.5-flash-preview-tts";
  const url = `${API_URL}/models/${model}:generateContent?key=${apiKey}`;

  const body: any = {
    contents: [{ parts: [{ text: options.text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: options.voiceName || "Kore",
          },
        },
      },
    },
  };

  try {
    console.log(`[TTS] Generating speech with ${model}...`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: `API error ${res.status}: ${err.error?.message || res.statusText}` };
    }

    const data = await res.json();
    const audioPart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inline_data?.data);
    if (audioPart) {
      return { audioBase64: audioPart.inline_data.data };
    }
    return { error: "No audio in response" };
  } catch (err: any) {
    return { error: `Network error: ${err.message}` };
  }
}
