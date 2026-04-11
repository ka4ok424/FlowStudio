import { saveImage } from "../store/imageDb";

// Maximum number of generation history items per node
export const MAX_HISTORY = 10;

/** Add item to history. Saves data URL to IndexedDB, stores lightweight marker in array.
 *  Only _previewUrl holds the actual data URL in memory (current image). */
export async function addToHistory(
  nodeId: string,
  currentHistory: string[],
  newItem: string
): Promise<{ history: string[]; index: number }> {
  const idx = currentHistory.length;

  // Save to IndexedDB
  if (newItem.startsWith("data:")) {
    await saveImage(`${nodeId}/_history_${idx}`, newItem).catch(() => {});
  }

  // Store marker in history array (not the full data URL)
  const marker = newItem.startsWith("data:") ? `__idb__:${nodeId}/_history_${idx}` : newItem;
  const updated = [...currentHistory, marker];

  // Trim to keep only last MAX_HISTORY
  if (updated.length > MAX_HISTORY) {
    const trimmed = updated.slice(-MAX_HISTORY);
    return { history: trimmed, index: trimmed.length - 1 };
  }
  return { history: updated, index: updated.length - 1 };
}
