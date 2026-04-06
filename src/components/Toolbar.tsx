import { useWorkflowStore } from "../store/workflowStore";
import { queuePrompt } from "../api/comfyApi";

export default function Toolbar() {
  const { isConnected, progress, buildWorkflow } = useWorkflowStore();

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

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <span className="app-title">FlowStudio</span>
        <span className={`connection-status ${isConnected ? "connected" : "disconnected"}`}>
          {isConnected ? "Connected" : "Disconnected"}
        </span>
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
        <button className="btn-run" onClick={handleRun}>
          &#9654; Run
        </button>
      </div>
    </div>
  );
}
