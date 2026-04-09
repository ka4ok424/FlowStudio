// IndexedDB storage for workflow images (portraits, previews, etc.)
// Separates large binary data from localStorage to avoid quota limits.

const DB_NAME = "flowstudio_images";
const DB_VERSION = 1;
const STORE_NAME = "images";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Save any string data under a key */
export async function saveImage(key: string, dataUrl: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(dataUrl, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
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
        // Cursor done — write copies
        for (const c of copies) {
          store.put(c.value, c.key);
        }
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

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

/** Extract image fields from nodes before saving to localStorage.
 *  Converts API/blob URLs to data URLs, then moves to IndexedDB.
 *  Returns stripped nodes + map of images to save to IndexedDB. */
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
      if (!val || typeof val !== "string" || val.startsWith("__idb__:")) continue;

      // Convert API/blob URLs to data URLs first
      if (!val.startsWith("data:")) {
        const dataUrl = await fetchAsDataUrl(val);
        if (dataUrl) {
          val = dataUrl;
          wv[field] = val;
        } else {
          wv[field] = ""; // URL is dead, clear it
          changed = true;
          continue;
        }
      }

      // Now extract data URL to IndexedDB
      const key = `${wfId}/${n.id}/${field}`;
      images.set(key, val);
      wv[field] = `__idb__:${key}`;
      changed = true;
    }

    // Also handle _history array
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

/** Restore image references in nodes from IndexedDB */
export async function restoreImages(nodes: any[]): Promise<any[]> {
  const db = await openDb();
  const keysToFetch: string[] = [];
  const IMAGE_FIELDS = ["portraitUrl", "_previewUrl", "_preview"];

  // Collect all keys to fetch
  for (const n of nodes) {
    if (!n.data?.widgetValues) continue;
    for (const field of IMAGE_FIELDS) {
      const val = n.data.widgetValues[field];
      if (val && typeof val === "string" && val.startsWith("__idb__:")) {
        keysToFetch.push(val.slice(8));
      }
    }
    if (Array.isArray(n.data.widgetValues._history)) {
      for (const url of n.data.widgetValues._history) {
        if (url && typeof url === "string" && url.startsWith("__idb__:")) {
          keysToFetch.push(url.slice(8));
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
        if (req.result) cache.set(key, req.result);
      };
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Replace placeholders
  return nodes.map((n) => {
    if (!n.data?.widgetValues) return n;
    const wv = { ...n.data.widgetValues };
    let changed = false;
    for (const field of IMAGE_FIELDS) {
      const val = wv[field];
      if (val && typeof val === "string" && val.startsWith("__idb__:")) {
        const restored = cache.get(val.slice(8));
        if (restored) { wv[field] = restored; changed = true; }
      }
    }
    if (Array.isArray(wv._history)) {
      wv._history = wv._history.map((url: string) => {
        if (url && typeof url === "string" && url.startsWith("__idb__:")) {
          return cache.get(url.slice(8)) || url;
        }
        return url;
      });
      changed = true;
    }
    if (!changed) return n;
    return { ...n, data: { ...n.data, widgetValues: wv } };
  });
}
