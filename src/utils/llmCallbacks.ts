// System prompts and image fetching helpers shared by Critique and Refine nodes.

export const GEMINI_TEXT_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
];

export const CRITIQUE_SYSTEM = `You are a senior art director reviewing AI-generated images.
When an image is attached, your feedback MUST be grounded in what you actually see — describe specific visual problems (anatomy, composition, lighting, textures, colour, artefacts, consistency). Do NOT critique a prompt unless no image is provided.
If only a prompt is attached (no image), critique the wording instead.
Keep the response under 12 lines. Structure:
- 3-5 concrete issues (numbered, visual if image present)
- 1-2 actionable suggestions
Avoid generic praise. Avoid speculation. If something is fine, do not list it.`;

export const REFINE_SYSTEM = `You are an expert prompt engineer for diffusion models (FLUX/SDXL).
Rewrite the user's prompt so the next generation will be better.
- Use descriptive, declarative language (NOT instructions like "add", "remove", "change").
- 15-40 words. No markdown. No headings. No quotes.
- If an image is provided, target the specific issues you can see and preserve what's already good.
- If a "goal" text is provided, prioritise the goal.
Output ONLY the rewritten prompt as a single paragraph. Nothing else.`;

/** Fetch any URL/data URL/blob URL and return raw base64 (no data: prefix). */
export async function urlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
  // strip "data:image/png;base64,"
  const i = dataUrl.indexOf(",");
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}
