import { saveImage } from "../store/imageDb";

// Maximum number of generation history items per node
export const MAX_HISTORY = 10;

// Global counter per node to ensure unique IDB keys
const counters: Record<string, number> = {};

/** Add item to history. Saves data URL to IndexedDB, stores lightweight marker in array.
 *  Only _previewUrl holds the actual data URL in memory (current image). */
export async function addToHistory(
  nodeId: string,
  currentHistory: string[],
  newItem: string
): Promise<{ history: string[]; index: number }> {
  // Use global counter for unique IDB keys (never reuse old keys)
  if (!(nodeId in counters)) {
    // Initialize from highest existing index in history
    let maxIdx = 0;
    for (const m of currentHistory) {
      const match = m.match(/_history_(\d+)/);
      if (match) maxIdx = Math.max(maxIdx, parseInt(match[1]) + 1);
    }
    counters[nodeId] = maxIdx;
  }
  const idx = counters[nodeId]++;

  // Save to IndexedDB
  const idbKey = `${nodeId}/_history_${idx}`;
  if (newItem.startsWith("data:")) {
    await saveImage(idbKey, newItem).catch(() => {});
  }

  // Store marker in history array (not the full data URL)
  const marker = newItem.startsWith("data:") ? `__idb__:${idbKey}` : newItem;
  const updated = [...currentHistory, marker];

  // Trim to keep only last MAX_HISTORY
  if (updated.length > MAX_HISTORY) {
    const trimmed = updated.slice(-MAX_HISTORY);
    return { history: trimmed, index: trimmed.length - 1 };
  }
  return { history: updated, index: updated.length - 1 };
}
