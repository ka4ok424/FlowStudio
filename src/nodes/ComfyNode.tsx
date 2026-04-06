import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ComfyNodeData } from "../store/workflowStore";

// ── Category colors ────────────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  loaders: "#e8a040", sampling: "#5b9bd5", conditioning: "#c77dbb",
  latent: "#7c8bd5", image: "#4ecdc4", mask: "#4ecdc4",
  advanced: "#e85d75", video: "#e85d75", audio: "#e8a040",
  utils: "#888888",
};

const SLOT_COLORS: Record<string, string> = {
  IMAGE: "#64b5f6", LATENT: "#ab47bc", MODEL: "#b39ddb",
  CLIP: "#f0c040", VAE: "#ff7043", CONDITIONING: "#ef9a9a",
  MASK: "#4dd0e1", INT: "#81c784", FLOAT: "#81c784",
  STRING: "#ce93d8", COMBO: "#90a4ae", BOOLEAN: "#e6ee9c",
  CONTROL_NET: "#a1887f", "*": "#aaaaaa",
};

function getCatColor(category: string): string {
  const cat = category.toLowerCase();
  for (const [k, v] of Object.entries(CAT_COLORS)) {
    if (cat.includes(k)) return v;
  }
  return "#555555";
}

function getSlotColor(type: string): string {
  return SLOT_COLORS[type] || SLOT_COLORS["*"];
}

// ── Determine which inputs are connections vs widgets ───────────────
function getConnectionInputs(inputs: Record<string, any>): string[] {
  const connInputs: string[] = [];
  const required = inputs.required || {};
  const optional = inputs.optional || {};

  for (const [name, config] of Object.entries({ ...required, ...optional })) {
    if (Array.isArray(config) && typeof config[0] === "string") {
      const type = config[0];
      // Non-primitive types are connections
      if (!["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"].includes(type) && !Array.isArray(config[0])) {
        connInputs.push(name);
      }
    }
  }
  return connInputs;
}

// ── Node component ─────────────────────────────────────────────────
function ComfyNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ComfyNodeData;
  const accentColor = getCatColor(nodeData.category);
  const connectionInputs = getConnectionInputs(nodeData.inputs);

  return (
    <div
      className={`comfy-node ${selected ? "selected" : ""}`}
      style={{ "--accent": accentColor } as React.CSSProperties}
    >
      {/* Color bar */}
      <div className="node-accent" style={{ background: accentColor }} />

      {/* Header */}
      <div className="node-header">
        <span className="node-title">{nodeData.label}</span>
      </div>

      {/* Connection inputs (left handles) */}
      <div className="node-slots">
        {connectionInputs.map((name) => {
          const config = (nodeData.inputs.required?.[name] || nodeData.inputs.optional?.[name]) as any[];
          const type = config?.[0] || "*";
          const color = getSlotColor(type);
          return (
            <div key={name} className="node-slot input-slot">
              <Handle
                type="target"
                position={Position.Left}
                id={name}
                className="slot-handle"
                style={{ background: color, top: "50%" }}
              />
              <span className="slot-label" style={{ color: color + "cc" }}>
                {name}
              </span>
              <span className="slot-type">{type}</span>
            </div>
          );
        })}

        {/* Outputs (right handles) */}
        {nodeData.outputs.map((type, idx) => {
          const color = getSlotColor(type);
          const name = nodeData.outputNames[idx] || type;
          return (
            <div key={`out_${idx}`} className="node-slot output-slot">
              <span className="slot-type">{type}</span>
              <span className="slot-label" style={{ color: color + "cc" }}>
                {name}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={`output_${idx}`}
                className="slot-handle"
                style={{ background: color, top: "50%" }}
              />
            </div>
          );
        })}
      </div>

      {/* Widgets (non-connection inputs) */}
      <div className="node-widgets">
        {Object.entries(nodeData.inputs.required || {}).map(([name, config]) => {
          if (connectionInputs.includes(name)) return null;
          return <WidgetField key={name} name={name} config={config as any[]} nodeData={nodeData} />;
        })}
      </div>
    </div>
  );
}

// ── Widget field ───────────────────────────────────────────────────
function WidgetField({ name, config, nodeData }: { name: string; config: any[]; nodeData: ComfyNodeData }) {
  const value = nodeData.widgetValues[name];

  // Enum / combo
  if (Array.isArray(config[0])) {
    return (
      <div className="widget-row">
        <label>{name}</label>
        <select value={value ?? config[0][0]} disabled>
          {config[0].map((opt: string) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  const type = config[0];
  const opts = config[1] || {};

  if (type === "INT" || type === "FLOAT") {
    return (
      <div className="widget-row">
        <label>{name}</label>
        <input
          type="number"
          value={value ?? opts.default ?? 0}
          min={opts.min}
          max={opts.max}
          step={type === "FLOAT" ? 0.01 : 1}
          readOnly
        />
      </div>
    );
  }

  if (type === "STRING") {
    return (
      <div className="widget-row">
        <label>{name}</label>
        <input type="text" value={value ?? ""} placeholder={name} readOnly />
      </div>
    );
  }

  return null;
}

export default memo(ComfyNode);
