import { useState, useCallback, useRef, useEffect } from "react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt } from "../api/comfyApi";
import SettingsModal from "./SettingsModal";
import ProjectManager from "./ProjectManager";
import SystemStatsIndicator from "./SystemStatsIndicator";

export default function Toolbar() {
  const { isConnected, progress, buildWorkflow, currentProjectName, setCurrentProjectName, saveProject, undo, redo } = useWorkflowStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleStop = async () => {
    try {
      await fetch("/api/interrupt", { method: "POST" });
    } catch (err) {
      console.error("[Toolbar] Failed to interrupt:", err);
    }
  };

  const handleRun = async () => {
    const workflow = buildWorkflow();
    if (Object.keys(workflow).length === 0) return;
    try {
      const result = await queuePrompt(workflow);
      console.log("Queued:", result.prompt_id);
    } catch (err) {
      console.error("Queue failed:", err);
    }
  };

  const [saveNotice, setSaveNotice] = useState(false);
  const handleSave = useCallback(async () => {
    await saveProject(true);
    setSaveNotice(true);
    setTimeout(() => setSaveNotice(false), 1500);
  }, [saveProject]);

  // Edit project name
  const startEditName = useCallback(() => {
    setNameValue(currentProjectName);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 10);
  }, [currentProjectName]);

  const commitName = useCallback(() => {
    setEditingName(false);
    if (nameValue.trim() && nameValue.trim() !== currentProjectName) {
      setCurrentProjectName(nameValue.trim());
    }
  }, [nameValue, currentProjectName, setCurrentProjectName]);

  // Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <span className="app-title" onClick={() => setShowProjects(true)} title="Open Projects">
          FlowStudio
        </span>
        <span className={`connection-status ${isConnected ? "connected" : "disconnected"}`}>
          {isConnected ? "Connected" : "Disconnected"}
        </span>
        <span className="toolbar-separator">|</span>
        {editingName ? (
          <input
            ref={nameInputRef}
            className="toolbar-project-name-input"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === "Enter") commitName(); if (e.key === "Escape") setEditingName(false); }}
            autoFocus
          />
        ) : (
          <span className="toolbar-project-name" onClick={startEditName} title="Click to rename">
            {currentProjectName}
          </span>
        )}
        <button className="toolbar-undo-btn" onClick={undo} title="Undo (Cmd+Z)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </button>
        <button className="toolbar-undo-btn" onClick={redo} title="Redo (Cmd+Shift+Z)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
          </svg>
        </button>
        {saveNotice && <span className="toolbar-save-notice">Saved</span>}
      </div>

      <div className="toolbar-center">
        {progress && (
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(progress.value / progress.max) * 100}%` }}
            />
            <span className="progress-text">
              {progress.value}/{progress.max}
            </span>
          </div>
        )}
      </div>

      <div className="toolbar-right">
        <SystemStatsIndicator />
        <button className="btn-settings" onClick={() => setShowSettings(true)} title="Settings">
          ⚙
        </button>
        <button className="btn-stop" onClick={handleStop} title="Stop generation">
          ■
        </button>
        <button className="btn-run" onClick={handleRun}>
          ▶ Run
        </button>
      </div>

      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
      <ProjectManager open={showProjects} onClose={() => setShowProjects(false)} />
    </div>
  );
}
