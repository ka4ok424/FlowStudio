/** Convert a data:... URL to a blob: URL.
 *  Blob URLs live in native memory (not JS heap), so they don't bloat
 *  structuredClone, undo/redo snapshots, or GC pressure. */
export function dataUrlToBlobUrl(dataUrl: string): string {
  const [header, b64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}
