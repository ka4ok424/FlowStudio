import { getApiKey } from "../components/SettingsModal";

const API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

interface GenerateImageOptions {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  seed?: number;
  temperature?: number;
  numberOfImages?: number;
  safetySettings?: Record<string, string>;
  inputImage?: string;  // base64
  referenceImages?: string[];  // base64 array
}

interface GenerateImageResult {
  images: string[];  // base64 encoded
  error?: string;
}

export async function generateImage(options: GenerateImageOptions): Promise<GenerateImageResult> {
  const apiKey = getApiKey("google");
  if (!apiKey) {
    return { images: [], error: "Google API key not set. Go to Settings (\u2699)." };
  }

  const model = options.model || "gemini-2.5-flash-image";
  const url = `${API_URL}/${model}:generateContent?key=${apiKey}`;

  // Build parts
  const parts: any[] = [];

  // Add text prompt
  if (options.prompt) {
    parts.push({ text: options.prompt });
  }

  // Add input image if provided
  if (options.inputImage) {
    parts.push({
      inline_data: {
        mime_type: "image/png",
        data: options.inputImage,
      },
    });
  }

  // Add reference images
  if (options.referenceImages) {
    for (const ref of options.referenceImages) {
      parts.push({
        inline_data: {
          mime_type: "image/png",
          data: ref,
        },
      });
    }
  }

  // If no prompt, add default
  if (parts.length === 0) {
    parts.push({ text: "Generate an image" });
  }

  const body: any = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["IMAGE"],
    },
  };

  // Aspect ratio
  if (options.aspectRatio) {
    body.generationConfig.imageConfig = {
      aspectRatio: options.aspectRatio,
    };
  }

  // Temperature
  if (options.temperature !== undefined) {
    body.generationConfig.temperature = options.temperature;
  }

  // Safety settings
  if (options.safetySettings) {
    body.safetySettings = Object.entries(options.safetySettings).map(([category, threshold]) => ({
      category,
      threshold,
    }));
  }

  console.log(`[NanoBanana] Generating with model: ${model}`);
  console.log(`[NanoBanana] Prompt: "${options.prompt}"`);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.error?.message || res.statusText;
      console.error(`[NanoBanana] API error ${res.status}: ${msg}`);
      return { images: [], error: `API error ${res.status}: ${msg}` };
    }

    const data = await res.json();
    console.log(`[NanoBanana] Response:`, JSON.stringify(data).slice(0, 500));
    const images: string[] = [];

    // Extract images from response
    if (data.candidates) {
      for (const candidate of data.candidates) {
        if (candidate.content?.parts) {
          for (const part of candidate.content.parts) {
            // API returns either inline_data or inlineData depending on model version
            const inl = part.inline_data || part.inlineData;
            if (inl?.data) {
              images.push(inl.data);
            }
          }
        }
      }
    }

    if (images.length === 0) {
      const textParts = data.candidates?.[0]?.content?.parts?.filter((p: any) => p.text) || [];
      const textResponse = textParts.map((p: any) => p.text).join("\n");
      console.warn(`[NanoBanana] No images in response. Text: ${textResponse}`);
      return { images: [], error: textResponse || "No images generated. Try a different prompt." };
    }

    console.log(`[NanoBanana] Generated ${images.length} image(s)`);
    return { images };
  } catch (err: any) {
    console.error(`[NanoBanana] Network error: ${err.message}`);
    return { images: [], error: `Network error: ${err.message}` };
  }
}
