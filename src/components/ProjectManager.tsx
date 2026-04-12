import { useState, useEffect, useCallback, useRef } from "react";
import { useWorkflowStore, type ProjectMeta } from "../store/workflowStore";
import { saveImage, loadImage } from "../store/imageDb";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ProjectManager({ open, onClose }: Props) {
  const { listProjects, createProject, deleteProject, cloneProject, renameProject, loadProject } = useWorkflowStore();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    if (open) {
      setProjects(listProjects());
      setMenuOpen(null);
      setRenamingId(null);
    }
  }, [open, listProjects]);

  const refresh = () => setProjects(listProjects());

  const handleCreate = useCallback(async () => {
    await createProject("Untitled");
    onClose();
  }, [createProject, onClose]);

  const handleOpen = useCallback(async (id: string) => {
    await loadProject(id);
    onClose();
  }, [loadProject, onClose]);

  const handleDelete = useCallback(async (id: string) => {
    const project = projects.find((p) => p.id === id);
    if (!window.confirm(`Delete "${project?.name || "project"}"? Backups will be kept.`)) return;
    setMenuOpen(null);
    await deleteProject(id);
    refresh();
  }, [deleteProject, projects]);

  const handleClone = useCallback(async (id: string) => {
    await cloneProject(id);
    setMenuOpen(null);
    refresh();
  }, [cloneProject]);

  const startRename = useCallback((id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
    setMenuOpen(null);
  }, []);

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      renameProject(renamingId, renameValue.trim());
      setRenamingId(null);
      refresh();
    }
  }, [renamingId, renameValue, renameProject]);

  const importRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(async (id: string) => {
    setMenuOpen(null);
    const project = projects.find((p) => p.id === id);
    const raw = await loadImage(`project_${id}`);
    if (!raw) return;
    const data = JSON.parse(raw);
    const exportData = {
      version: 1,
      name: project?.name || "Untitled",
      exportedAt: Date.now(),
      nodes: data.nodes,
      edges: data.edges,
      chatMessages: JSON.parse(localStorage.getItem(`flowstudio_chat_${id}`) || "[]"),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(project?.name || "project").replace(/[^a-zA-Z0-9а-яА-Я ]/g, "_")}.flowstudio.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [projects]);

  const handleImport = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.nodes || !data.edges) { alert("Invalid project file"); return; }
      const name = data.name || file.name.replace(".flowstudio.json", "").replace(".json", "");
      const newId = await createProject(name);
      const wfData = JSON.stringify({ nodes: data.nodes, edges: data.edges });
      await saveImage(`project_${newId}`, wfData);
      if (data.chatMessages?.length) {
        localStorage.setItem(`flowstudio_chat_${newId}`, JSON.stringify(data.chatMessages));
      }
      await loadProject(newId);
      onClose();
    } catch { alert("Failed to import project"); }
  }, [createProject, loadProject, onClose]);

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      ", " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  };

  if (!open) return null;

  return (
    <div className="pm-overlay" onClick={onClose}>
      <div className="pm-modal" onClick={(e) => { e.stopPropagation(); setMenuOpen(null); }}>
        <div className="pm-header">
          <h2 className="pm-title">My Projects</h2>
          <button className="pm-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="pm-grid">
          {/* Create new */}
          <div className="pm-card pm-card-new" onClick={() => { if (menuOpen !== "_create") handleCreate(); }}>
            <div className="pm-card-new-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <span className="pm-card-new-label">Create New Project</span>
            <button className="pm-card-menu-btn" onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(menuOpen === "_create" ? null : "_create");
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
              </svg>
            </button>
            {menuOpen === "_create" && (
              <div className="pm-card-menu" onClick={(e) => e.stopPropagation()}>
                <button className="pm-menu-item" onClick={() => { setMenuOpen(null); importRef.current?.click(); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Import Project
                </button>
              </div>
            )}
            <input ref={importRef} type="file" accept=".json,.flowstudio" style={{ display: "none" }}
              onChange={(e) => { if (e.target.files?.[0]) handleImport(e.target.files[0]); e.target.value = ""; }} />
          </div>

          {/* Project cards */}
          {projects.sort((a, b) => b.updatedAt - a.updatedAt).map((p) => (
            <div key={p.id} className="pm-card" onClick={() => handleOpen(p.id)}>
              <div className="pm-card-preview">
                {p.thumbnail && (
                  <img src={p.thumbnail} alt="" className="pm-card-thumb" />
                )}
                <span className="pm-card-badge">{p.nodeCount} nodes</span>
              </div>
              <div className="pm-card-info">
                {renamingId === p.id ? (
                  <input
                    className="pm-rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingId(null); }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <span className="pm-card-name">{p.name}</span>
                )}
                <span className="pm-card-date">Edited {formatDate(p.updatedAt)}</span>
              </div>
              {/* Three dots menu */}
              <button className="pm-card-menu-btn" onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(menuOpen === p.id ? null : p.id);
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                </svg>
              </button>
              {menuOpen === p.id && (
                <div className="pm-card-menu" onClick={(e) => e.stopPropagation()}>
                  <button className="pm-menu-item" onClick={() => startRename(p.id, p.name)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Rename
                  </button>
                  <button className="pm-menu-item" onClick={() => handleClone(p.id)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Duplicate
                  </button>
                  <button className="pm-menu-item" onClick={() => handleExport(p.id)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Export
                  </button>
                  <button className="pm-menu-item pm-menu-danger" onClick={() => handleDelete(p.id)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" /><path d="M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
