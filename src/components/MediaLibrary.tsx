import { useState, useMemo } from "react";
import { useMediaStore, type MediaItem } from "../store/mediaStore";

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "#e74c6f" : "none"} stroke={filled ? "#e74c6f" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

type ViewMode = "gallery" | "timeline";
type FilterType = "all" | "image" | "video" | "audio";
type FilterSource = "all" | "imported" | "generated" | "favorites";

export default function MediaLibrary() {
  const { items, toggleFavorite, removeItem } = useMediaStore();
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterSource, setFilterSource] = useState<FilterSource>("all");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (filterType !== "all" && item.type !== filterType) return false;
      if (filterSource === "favorites" && !item.favorite) return false;
      if (filterSource === "imported" && item.source !== "imported") return false;
      if (filterSource === "generated" && item.source !== "generated") return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !item.fileName.toLowerCase().includes(q) &&
          !item.genMeta?.prompt?.toLowerCase().includes(q) &&
          !item.genMeta?.model?.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [items, filterType, filterSource, search]);

  return (
    <div className="media-library">
      {/* Header */}
      <div className="media-header">
        <h2>Media</h2>
        <div className="media-view-toggle">
          <button
            className={`media-view-btn ${viewMode === "gallery" ? "active" : ""}`}
            onClick={() => setViewMode("gallery")}
            title="Gallery"
          >⊞</button>
          <button
            className={`media-view-btn ${viewMode === "timeline" ? "active" : ""}`}
            onClick={() => setViewMode("timeline")}
            title="Timeline"
          >☰</button>
        </div>
      </div>

      {/* Search */}
      <input
        className="library-search"
        type="text"
        placeholder="Search media..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Filters */}
      <div className="media-filters">
        <div className="media-filter-row">
          {(["all", "imported", "generated", "favorites"] as FilterSource[]).map((f) => (
            <button
              key={f}
              className={`media-filter-btn ${filterSource === f ? "active" : ""}`}
              onClick={() => setFilterSource(f)}
            >
              {f === "all" ? "All" : f === "favorites" ? <HeartIcon filled /> : f === "imported" ? "Imported" : "Generated"}
            </button>
          ))}
        </div>
        <div className="media-filter-row">
          {(["all", "image", "video", "audio"] as FilterType[]).map((f) => (
            <button
              key={f}
              className={`media-filter-btn ${filterType === f ? "active" : ""}`}
              onClick={() => setFilterType(f)}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="media-content">
        {filtered.length === 0 && (
          <div className="media-empty">No media yet. Generate or import files.</div>
        )}

        {viewMode === "gallery" ? (
          <GalleryView items={filtered} onSelect={setSelectedItem} onFav={toggleFavorite} onDelete={removeItem} />
        ) : (
          <TimelineView items={filtered} onSelect={setSelectedItem} onFav={toggleFavorite} onDelete={removeItem} />
        )}
      </div>

      {/* Detail overlay */}
      {selectedItem && (
        <MediaDetail item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
}

// ── Gallery View ───────────────────────────────────────────────────
function GalleryView({
  items, onSelect, onFav, onDelete,
}: {
  items: MediaItem[];
  onSelect: (item: MediaItem) => void;
  onFav: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const handleDragStart = (e: React.DragEvent, item: MediaItem) => {
    e.dataTransfer.setData("application/flowstudio-media", JSON.stringify({
      url: item.url,
      fileName: item.fileName,
      type: item.type,
    }));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="media-gallery">
      {items.map((item) => (
        <div
          key={item.id}
          className={`media-gallery-item ${item.favorite ? "is-fav" : ""}`}
          onClick={() => onSelect(item)}
          draggable
          onDragStart={(e) => handleDragStart(e, item)}
        >
          {item.url && item.type === "image" ? (
            <img src={item.url} alt="" className="media-thumb" draggable={false} />
          ) : (
            <div className="media-thumb-placeholder">
              {item.type === "video" ? "🎬" : item.type === "audio" ? "🎵" : "📄"}
            </div>
          )}
          {/* Heart — top right, always visible when favorited */}
          <button className="media-fav-btn" onClick={(e) => { e.stopPropagation(); onFav(item.id); }}>
            <HeartIcon filled={item.favorite} />
          </button>
          {/* Trash — bottom right, only on hover */}
          <button className="media-del-btn" onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}>
            <TrashIcon />
          </button>
          {item.genMeta && (
            <div className="media-gallery-badge">AI</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Timeline View ──────────────────────────────────────────────────
function TimelineView({
  items, onSelect, onFav, onDelete,
}: {
  items: MediaItem[];
  onSelect: (item: MediaItem) => void;
  onFav: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  // Group by date
  const grouped = items.reduce((acc, item) => {
    const date = new Date(item.createdAt).toLocaleDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(item);
    return acc;
  }, {} as Record<string, MediaItem[]>);

  return (
    <div className="media-timeline">
      {Object.entries(grouped).map(([date, dayItems]) => (
        <div key={date} className="timeline-group">
          <div className="timeline-date">{date}</div>
          {dayItems.map((item) => (
            <div key={item.id} className="timeline-item" onClick={() => onSelect(item)}>
              <div className="timeline-thumb-wrap">
                {item.url && item.type === "image" ? (
                  <img src={item.url} alt="" className="timeline-thumb" />
                ) : (
                  <div className="timeline-thumb-placeholder">
                    {item.type === "video" ? "🎬" : "🎵"}
                  </div>
                )}
              </div>
              <div className="timeline-info">
                <div className="timeline-name">{item.fileName}</div>
                {item.genMeta && (
                  <div className="timeline-meta">
                    {item.genMeta.model} · seed {item.genMeta.seed}
                  </div>
                )}
                {item.genMeta?.prompt && (
                  <div className="timeline-prompt">{item.genMeta.prompt.slice(0, 60)}...</div>
                )}
                <div className="timeline-time">
                  {new Date(item.createdAt).toLocaleTimeString()}
                </div>
              </div>
              <div className="timeline-actions">
                <button className="media-mini-btn" onClick={(e) => { e.stopPropagation(); onFav(item.id); }}>
                  <HeartIcon filled={item.favorite} />
                </button>
                <button className="media-mini-btn media-mini-del" onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Detail Overlay ─────────────────────────────────────────────────
function MediaDetail({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  return (
    <div className="media-detail-overlay" onClick={onClose}>
      <div className="media-detail" onClick={(e) => e.stopPropagation()}>
        <button className="media-detail-close" onClick={onClose}>✕</button>

        {item.url && item.type === "image" && (
          <img src={item.url} alt="" className="media-detail-img" />
        )}

        <div className="media-detail-info">
          <div className="media-detail-row">
            <span className="media-detail-label">File</span>
            <span className="media-detail-value">{item.fileName}</span>
          </div>
          <div className="media-detail-row">
            <span className="media-detail-label">Type</span>
            <span className="media-detail-value">{item.type.toUpperCase()}</span>
          </div>
          <div className="media-detail-row">
            <span className="media-detail-label">Source</span>
            <span className="media-detail-value">{item.source}</span>
          </div>
          {item.genMeta && (
            <>
              <div className="media-detail-divider" />
              <div className="media-detail-row">
                <span className="media-detail-label">Prompt</span>
                <span className="media-detail-value">{item.genMeta.prompt}</span>
              </div>
              <div className="media-detail-row">
                <span className="media-detail-label">Model</span>
                <span className="media-detail-value">{item.genMeta.model}</span>
              </div>
              <div className="media-detail-row">
                <span className="media-detail-label">Seed</span>
                <span className="media-detail-value">{item.genMeta.seed}</span>
              </div>
              {item.genMeta.steps && (
                <div className="media-detail-row">
                  <span className="media-detail-label">Steps</span>
                  <span className="media-detail-value">{item.genMeta.steps}</span>
                </div>
              )}
              {item.genMeta.cfg && (
                <div className="media-detail-row">
                  <span className="media-detail-label">CFG</span>
                  <span className="media-detail-value">{item.genMeta.cfg}</span>
                </div>
              )}
              {item.genMeta.width && (
                <div className="media-detail-row">
                  <span className="media-detail-label">Size</span>
                  <span className="media-detail-value">{item.genMeta.width}×{item.genMeta.height}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
