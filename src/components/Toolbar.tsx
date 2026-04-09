import { useState, useCallback, useRef, useEffect } from "react";
import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt } from "../api/comfyApi";
import SettingsModal from "./SettingsModal";
import ProjectManager from "./ProjectManager";

export default function Toolbar() {
  const { isConnected, progress, buildWorkflow, currentProjectName, setCurrentProjectName, saveProject } = useWorkflowStore();
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
    await saveProject();
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
