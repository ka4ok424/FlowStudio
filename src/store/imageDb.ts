// IndexedDB storage for workflow images (portraits, previews, etc.)
// Separates large binary data from localStorage to avoid quota limits.
//
// Architecture (v2):
// - Singleton DB connection (no re-open per call)
// - _persistedKeys tracks what's already in IDB (skip re-saves)
// - saveImageBatch for single-transaction bulk writes
// - 5s write timeout to detect hung IDB
// - checkIdbHealth for proactive failure detection

const DB_NAME = "flowstudio_images";
const DB_VERSION = 1;
const STORE_NAME = "images";

// ── Singleton connection ──────────────────────────────────────────
let _dbInstance: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_dbInstance) return Promise.resolve(_dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => {
      _dbInstance = req.result;
      _dbInstance.onclose = () => { _dbInstance = null; };
      _dbInstance.onerror = () => { _dbInstance = null; };
      resolve(_dbInstance);
    };
    req.onerror = () => reject(req.error);
  });
}

// ── Persisted keys tracking ───────────────────────────────────────
// In-memory set of IDB keys known to be saved. Prevents re-saving unchanged images.
// Reset on page reload — first save after reload will re-persist (safe default).
const _persistedKeys = new Set<string>();

export function isKeyPersisted(key: string): boolean {
  return _persistedKeys.has(key);
}

export function markKeyPersisted(key: string): void {
  _persistedKeys.add(key);
}

// ── Core operations ───────────────────────────────────────────────

/** Save any string data under a key (with 5s timeout) */
export async function saveImage(key: string, dataUrl: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("IDB write timeout")), 5000);
    const tx = db.transaction(STORE_NAME, "readwrite", { durability: "strict" } as any);
    tx.objectStore(STORE_NAME).put(dataUrl, key);
    tx.oncomplete = () => { clearTimeout(timeout); _persistedKeys.add(key); resolve(); };
    tx.onerror = () => { clearTimeout(timeout); reject(tx.error); };
  });
}

/** Save multiple entries in a single transaction */
export async function saveImageBatch(entries: Map<string, string>): Promise<void> {
  if (entries.size === 0) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("IDB batch write timeout")), 15000);
    const tx = db.transaction(STORE_NAME, "readwrite", { durability: "strict" } as any);
    const store = tx.objectStore(STORE_NAME);
    for (const [key, value] of entries) {
      store.put(value, key);
    }
    tx.oncomplete = () => {
      clearTimeout(timeout);
      for (const key of entries.keys()) _persistedKeys.add(key);
      resolve();
    };
    tx.onerror = () => { clearTimeout(timeout); reject(tx.error); };
  });
}

/** Load an image by key */
export async function loadImage(key: string): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** Delete all images for a workflow prefix (e.g. "wfId/") */
export async function deleteImagesByPrefix(prefix: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        if (typeof cursor.key === "string" && cursor.key.startsWith(prefix)) {
          cursor.delete();
          _persistedKeys.delete(cursor.key as string);
        }
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Copy all images from one prefix to another (for clone) */
export async function copyImagesByPrefix(srcPrefix: string, dstPrefix: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();
    const copies: { key: string; value: string }[] = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        if (typeof cursor.key === "string" && cursor.key.startsWith(srcPrefix)) {
          const newKey = dstPrefix + cursor.key.slice(srcPrefix.length);
          copies.push({ key: newKey, value: cursor.value });
        }
        cursor.continue();
      } else {
        for (const c of copies) {
          store.put(c.value, c.key);
          _persistedKeys.add(c.key);
        }
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Check if IDB is actually writing to disk (not just caching) */
export async function checkIdbHealth(): Promise<"ok" | "readonly" | "dead"> {
  const testKey = "__health_check__";
  const testVal = String(Date.now());
  try {
    await saveImage(testKey, testVal);
    const readBack = await loadImage(testKey);
    if (readBack === testVal) return "ok";
    return "readonly";
  } catch {
    return "dead";
  }
}

// ── Image extraction / restoration ────────────────────────────────

/** Convert a non-data URL to data URL by fetching it */
async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    if (blob.size === 0) return null;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string || null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Extract image fields from nodes before saving.
 *  INCREMENTAL: skips images already persisted in IDB (_persistedKeys). */
export async function extractImages(
  wfId: string,
  nodes: any[]
): Promise<{ strippedNodes: any[]; images: Map<string, string> }> {
  const images = new Map<string, string>();
  const IMAGE_FIELDS = ["portraitUrl", "_previewUrl", "_preview"];

  const strippedNodes = [];
  for (const n of nodes) {
    if (!n.data?.widgetValues) { strippedNodes.push(n); continue; }
    const wv = { ...n.data.widgetValues };
    let changed = false;

    for (const field of IMAGE_FIELDS) {
      let val = wv[field];
      if (!val || typeof val !== "string") continue;

      // Already an IDB marker — keep as-is
      if (val.startsWith("__idb__:")) continue;

      const key = `${wfId}/${n.id}/${field}`;

      // Already persisted AND unchanged — skip re-save
      // Blob URLs are always NEW content (from fresh generation), must re-save
      if (_persistedKeys.has(key) && !val.startsWith("blob:")) {
        wv[field] = `__idb__:${key}`;
        changed = true;
        continue;
      }

      // Convert blob/API URLs to data URLs
      if (!val.startsWith("data:")) {
        const dataUrl = await fetchAsDataUrl(val);
        if (dataUrl) {
          val = dataUrl;
        } else {
          wv[field] = "";
          changed = true;
          continue;
        }
      }

      // New image — needs IDB write
      images.set(key, val);
      wv[field] = `__idb__:${key}`;
      changed = true;
    }

    // Handle _history array — already uses __idb__: markers from addToHistory
    if (Array.isArray(wv._history)) {
      const newHist = [];
      for (let i = 0; i < wv._history.length; i++) {
        let url = wv._history[i];
        if (!url || url.startsWith("__idb__:")) { newHist.push(url); continue; }

        if (!url.startsWith("data:")) {
          const dataUrl = await fetchAsDataUrl(url);
          if (dataUrl) { url = dataUrl; } else { newHist.push(""); continue; }
        }

        const key = `${wfId}/${n.id}/_history_${i}`;
        images.set(key, url);
        newHist.push(`__idb__:${key}`);
      }
      wv._history = newHist.filter(Boolean);
      changed = true;
    }

    if (!changed) { strippedNodes.push(n); continue; }
    strippedNodes.push({ ...n, data: { ...n.data, widgetValues: wv } });
  }

  return { strippedNodes, images };
}

/** Restore image references in nodes from IndexedDB.
 *  - Only restores current preview fields (not history) → lazy loading.
 *  - Converts data URLs to blob URLs → keeps images out of JS heap.
 *  - Populates _persistedKeys for incremental saves. */
export async function restoreImages(nodes: any[]): Promise<any[]> {
  const { dataUrlToBlobUrl } = await import("../utils/blobUrl");
  const db = await openDb();
  const keysToFetch: string[] = [];
  const IMAGE_FIELDS = ["portraitUrl", "_previewUrl", "_preview"];

  // Collect only preview keys (skip _history — loaded on demand)
  for (const n of nodes) {
    if (!n.data?.widgetValues) continue;
    for (const field of IMAGE_FIELDS) {
      const val = n.data.widgetValues[field];
      if (val && typeof val === "string" && val.startsWith("__idb__:")) {
        keysToFetch.push(val.slice(8));
      }
    }
    // Track all history keys as persisted (they exist in IDB)
    if (Array.isArray(n.data.widgetValues._history)) {
      for (const h of n.data.widgetValues._history) {
        if (h && typeof h === "string" && h.startsWith("__idb__:")) {
          _persistedKeys.add(h.slice(8));
        }
      }
    }
  }

  if (keysToFetch.length === 0) return nodes;

  // Batch fetch
  const cache = new Map<string, string>();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    for (const key of keysToFetch) {
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result) {
          cache.set(key, req.result);
          _persistedKeys.add(key); // Mark as persisted for incremental saves
        }
      };
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Replace preview placeholders with blob URLs (history stays as __idb__: markers)
  return nodes.map((n) => {
    if (!n.data?.widgetValues) return n;
    const wv = { ...n.data.widgetValues };
    let changed = false;
    for (const field of IMAGE_FIELDS) {
      const val = wv[field];
      if (val && typeof val === "string" && val.startsWith("__idb__:")) {
        const restored = cache.get(val.slice(8));
        if (restored) {
          wv[field] = restored.startsWith("data:") ? dataUrlToBlobUrl(restored) : restored;
          changed = true;
        }
      }
    }
    if (!changed) return n;
    return { ...n, data: { ...n.data, widgetValues: wv } };
  });
}
