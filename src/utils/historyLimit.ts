// Maximum number of generation history items per node
// Each image is ~0.5-3 MB as data URL. 10 items ≈ 5-30 MB per node.
export const MAX_HISTORY = 10;

/** Add item to history, keeping only last MAX_HISTORY items */
export function addToHistory(currentHistory: string[], newItem: string): { history: string[]; index: number } {
  const updated = [...currentHistory, newItem];
  // Trim to keep only last MAX_HISTORY
  if (updated.length > MAX_HISTORY) {
    const trimmed = updated.slice(-MAX_HISTORY);
    return { history: trimmed, index: trimmed.length - 1 };
  }
  return { history: updated, index: updated.length - 1 };
}
