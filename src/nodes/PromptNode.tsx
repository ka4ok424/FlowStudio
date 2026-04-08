import { memo, useCallback, useRef, useEffect } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWorkflowStore } from "../store/workflowStore";

const MAX_CHARS = 50000;

function PromptNode({ id, data, selected }: NodeProps) {
  const nodeData = data as any;
  const text = nodeData.widgetValues?.text || "";
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const connectingType = useWorkflowStore((s) => s.connectingType);
  const connectingDir = useWorkflowStore((s) => s.connectingDirection);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.max(100, textareaRef.current.scrollHeight) + "px";
    }
  }, [text]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value.slice(0, MAX_CHARS);
      updateWidgetValue(id, "text", val);
    },
    [id, updateWidgetValue]
  );

  // Highlight output if someone is dragging a connection that needs TEXT
  const outputHighlight =
    connectingDir === "target" && connectingType === "TEXT" ? "highlight" : "";

  return (
    <div className={`prompt-node ${selected ? "selected" : ""}`}>
      {/* Accent bar */}
      <div className="prompt-node-inner">
        <div className="prompt-accent" />

        {/* Header */}
        <div className="prompt-header">
          <span className="prompt-icon">📄</span>
          <span className="prompt-title">Prompt</span>
        </div>
      </div>

      {/* Textarea */}
      <div className="prompt-body">
        <textarea
          ref={textareaRef}
          className="prompt-textarea nodrag nowheel"
          value={text}
          onChange={handleChange}
          placeholder="Type or dictate..."
          maxLength={MAX_CHARS}
        />
      </div>

      {/* Footer */}
      <div className="prompt-footer">
        <span className="prompt-charcount">
          {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
        </span>
      </div>

      {/* Output handle: TEXT */}
      <Handle
        type="source"
        position={Position.Right}
        id="output_0"
        className={`slot-handle ${outputHighlight}`}
        style={{ color: "#f0c040", top: "50px" }}
      />
    </div>
  );
}

export default memo(PromptNode);
