import { useEffect, useMemo, useState } from "react";
import { useWorkflowStore } from "../store/workflowStore";
import { getComfyDirectUrl } from "../api/comfyApi";

/**
 * Model Manager — read-only inventory of models known to the connected ComfyUI
 * backend. Lists checkpoints, UNet/diffusion models, VAEs, CLIPs, ControlNets,
 * LoRAs (whatever the loaders expose). Open ComfyUI link to manage on disk.
 */

interface Bucket {
  loader: string;
  field: string;
  label: string;
  category: "checkpoint" | "unet" | "vae" | "clip" | "controlnet" | "lora" | "upscaler" | "other";
}

const BUCKETS: Bucket[] = [
  { loader: "CheckpointLoaderSimple", field: "ckpt_name", label: "Checkpoints", category: "checkpoint" },
  { loader: "UNETLoader", field: "unet_name", label: "UNet / Diffusion", category: "unet" },
  { loader: "UnetLoaderGGUF", field: "unet_name", label: "GGUF UNet", category: "unet" },
  { loader: "VAELoader", field: "vae_name", label: "VAE", category: "vae" },
  { loader: "CLIPLoader", field: "clip_name", label: "CLIP / Text Encoders", category: "clip" },
  { loader: "ControlNetLoader", field: "control_net_name", label: "ControlNet", category: "controlnet" },
  { loader: "LoraLoader", field: "lora_name", label: "LoRA", category: "lora" },
  { loader: "UpscaleModelLoader", field: "model_name", label: "Upscalers", category: "upscaler" },
];

function categoryColor(c: Bucket["category"]): string {
  return ({
    checkpoint: "#ec407a",
    unet: "#3b82f6",
    vae: "#66bb6a",
    clip: "#ffb74d",
    controlnet: "#9c7bff",
    lora: "#26c6da",
    upscaler: "#ef5350",
    other: "#888",
  } as const)[c] || "#888";
}

export default function ModelLibrary() {
  const nodeDefs = useWorkflowStore((s) => s.nodeDefs);
  const [search, setSearch] = useState("");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set(["checkpoint", "unet"]));

  // Aggregate models per bucket from nodeDefs.
  const buckets = useMemo(() => {
    const seen = new Set<string>();
    const result: { bucket: Bucket; models: string[] }[] = [];
    for (const b of BUCKETS) {
      const def = nodeDefs[b.loader];
      const cfg = def?.input?.required?.[b.field];
      if (Array.isArray(cfg) && Array.isArray((cfg as any)[0])) {
        const list = ((cfg as any)[0] as string[]).filter((m) => {
          const k = `${b.category}::${m}`;
          if (seen.has(k)) return false;
          seen.add(k); return true;
        });
        result.push({ bucket: b, models: list });
      }
    }
    return result;
  }, [nodeDefs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return buckets;
    return buckets
      .map(({ bucket, models }) => ({
        bucket,
        models: models.filter((m) => m.toLowerCase().includes(q)),
      }))
      .filter((b) => b.models.length > 0);
  }, [buckets, search]);

  const totalModels = buckets.reduce((s, b) => s + b.models.length, 0);

  // Open real ComfyUI in a new tab (direct URL, not via Vite proxy).
  const openComfyUI = () => window.open(getComfyDirectUrl(), "_blank");
  const openComfyQueue = () => window.open(`${getComfyDirectUrl()}/queue`, "_blank");

  const toggleCat = (c: string) => {
    setOpenCats((prev) => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });
  };

  return (
    <div className="node-library-content">
      <div style={{ padding: "10px 12px 6px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Models</h2>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={openComfyUI}
              title={`Open ComfyUI UI in new tab (${getComfyDirectUrl()})`}
              style={{
                fontSize: 11, padding: "3px 8px",
                background: "transparent", border: "1px solid var(--border)",
                borderRadius: 4, color: "var(--text-muted)", cursor: "pointer",
              }}
            >Workflows ↗</button>
            <button
              onClick={openComfyQueue}
              title="Open ComfyUI queue / history in new tab"
              style={{
                fontSize: 11, padding: "3px 8px",
                background: "transparent", border: "1px solid var(--border)",
                borderRadius: 4, color: "var(--text-muted)", cursor: "pointer",
              }}
            >Queue ↗</button>
          </div>
        </div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
          {totalModels} models across {buckets.length} categories
        </div>
      </div>

      <input
        className="library-search"
        type="text"
        placeholder="Filter models..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="library-list">
        {filtered.map(({ bucket, models }) => {
          const isOpen = search.length > 0 || openCats.has(bucket.category);
          const colour = categoryColor(bucket.category);
          return (
            <div key={bucket.loader} className="library-category">
              <div className="category-header" onClick={() => toggleCat(bucket.category)}>
                <span className={`arrow ${isOpen ? "open" : ""}`}>&#9654;</span>
                <span className="category-name" style={{ color: colour }}>{bucket.label}</span>
                <span className="category-count">{models.length}</span>
              </div>
              {isOpen && (
                <div className="category-nodes">
                  {models.map((m) => (
                    <div key={m} className="library-node-card" style={{ paddingLeft: 8, borderLeft: `3px solid ${colour}66` }}>
                      <div className="card-name" title={m} style={{
                        fontSize: 11, whiteSpace: "nowrap",
                        overflow: "hidden", textOverflow: "ellipsis",
                      }}>{m.split(/[\\/]/).pop() || m}</div>
                      <div className="card-meta" style={{ fontSize: 9 }}>{bucket.loader}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {totalModels === 0 && (
          <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 12, textAlign: "center" }}>
            ComfyUI not connected, or no models loaded.
          </div>
        )}
      </div>
    </div>
  );
}
