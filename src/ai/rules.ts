// AI Assistant Rules & Context
// This file defines the knowledge base for the AI assistant.
// Edit these rules to change AI behavior.

import { getAllNativeNodes } from "../nodes/registry";
import { useWorkflowStore } from "../store/workflowStore";

// ── Connection Rules (auto-generated from registry) ─────────────
export function getConnectionRules(): string {
  const nodes = getAllNativeNodes();
  const rules: string[] = [];

  for (const node of nodes) {
    if (node.aiDoc.connectsTo?.length) {
      for (const target of node.aiDoc.connectsTo) {
        const targetNode = nodes.find((n) => n.type === target);
        if (targetNode) {
          // Find matching I/O
          for (const out of node.outputs) {
            for (const inp of targetNode.inputs) {
              if (out.type === inp.type || inp.type === "MEDIA" || out.type === "*") {
                rules.push(`${node.label}.${out.name} (${out.type}) → ${targetNode.label}.${inp.name}`);
              }
            }
          }
        }
      }
    }
  }

  return [...new Set(rules)].join("\n");
}

// ── Workflow Templates ──────────────────────────────────────────
export const WORKFLOW_TEMPLATES = `
COMMON WORKFLOWS (suggest these when user asks):

1. "Generate image from text":
   Prompt → Local Gen (or Nano Banana or Imagen)
   Connect: output_0 → prompt

2. "Create character":
   Prompt (description) → Local Gen → Character Card
   Connect: Prompt.output_0 → LocalGen.prompt
   Connect: LocalGen.output_0 → CharacterCard.portrait_input
   Connect: Prompt.output_0 → CharacterCard.ai_input

3. "Build scene with characters":
   N × Character Card → Scene + Prompt (action)
   Connect: CharacterCard.character_out → Scene.character_N
   Connect: Prompt.output_0 → Scene.action

4. "Generate video from image":
   Local Gen (or Scene) → Video Gen + Prompt
   Connect: LocalGen.output_0 → VideoGen.input_image
   Connect: Prompt.output_0 → VideoGen.prompt

5. "Multi-reference composition":
   N × (Local Gen or Import) → Multi Reference + Prompt
   Connect: sources to ref_0, ref_1, etc.
   Connect: Prompt.output_0 → MultiRef.prompt
   Optional: style image → MultiRef.style_ref

6. "Full animation pipeline":
   Prompts → Character Cards (approved) → Scene → Storyboard
   Scene → Video Gen → Preview
`;

// ── Layout Rules ────────────────────────────────────────────────
export const LAYOUT_RULES = `
LAYOUT RULES (MANDATORY — always follow when creating/moving nodes):

SPACING — nodes must NEVER touch or overlap:
- Minimum gap between any two nodes: 40px on all sides
- Horizontal spacing between connected nodes: 400px center-to-center
- Vertical spacing between parallel chains: 350px center-to-center
- Before placing a node, check existing positions and ensure no overlap
- Node sizes: S=260px wide, M=320px, L=420px, XL=500px. Height varies 200-500px

FLOW DIRECTION:
- Always LEFT → RIGHT (inputs on left side, outputs on right side)
- Align connected nodes horizontally in the same row
- When organizing: keep connected chains in same row

GROUP RULES — nodes must stay INSIDE their group:
- Group padding: minimum 60px from group edges to any node inside it
- Nodes belonging to a group must be fully contained within group boundaries
- Node x must be > group.x + 60 AND node x + nodeWidth < group.x + group.width - 60
- Node y must be > group.y + 80 (header) AND node y + nodeHeight < group.y + group.height - 60
- Groups must NOT overlap other groups — minimum 40px gap between groups
- When creating a group, calculate size to fit all nodes inside + padding
- When moving nodes into a group, resize group if nodes don't fit

GROUPING CONVENTIONS:
- Each scene/chapter gets its own Group (fs:group)
- Color coding: green=main story, blue=assets, purple=archive, orange=audio, red=important
- Add Comment below each group explaining its purpose
- Comments placed outside the group, 10px below group bottom edge
- Archive unused nodes in a separate group far right (x > 2000)
`;

// ── Build full context ──────────────────────────────────────────
export function getProjectContext(): string {
  const state = useWorkflowStore.getState();
  const nodes = state.nodes;
  const edges = state.edges;

  if (nodes.length === 0) return "\nCanvas is empty. Help the user create their first workflow.";

  // Current nodes with values
  const nodeList = nodes.map((n: any) => {
    const wv = n.data?.widgetValues || {};
    const vals: string[] = [];
    if (wv.text) vals.push(`text: "${wv.text.slice(0, 60)}${wv.text.length > 60 ? "..." : ""}"`);
    if (wv.name) vals.push(`name: "${wv.name}"`);
    if (wv.title) vals.push(`title: "${wv.title}"`);
    if (wv.model) vals.push(`model: ${wv.model}`);
    if (wv.status) vals.push(`status: ${wv.status}`);

    return {
      id: n.id,
      type: n.data?.type,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      ...(vals.length > 0 ? { values: vals.join(", ") } : {}),
    };
  });

  // Current connections
  const edgeList = edges.map((e: any) => `${e.source}.${e.sourceHandle} → ${e.target}.${e.targetHandle}`);

  let ctx = `\nCurrent project: "${state.currentProjectName}" (${nodes.length} nodes, ${edges.length} connections)`;
  ctx += `\n\nNodes:\n${JSON.stringify(nodeList, null, 1)}`;
  if (edgeList.length > 0) {
    ctx += `\n\nConnections:\n${edgeList.join("\n")}`;
  }

  return ctx;
}

// ── Custom user rules (editable via Settings) ───────────────────
const CUSTOM_RULES_KEY = "flowstudio_ai_rules";

export function getCustomRules(): string {
  try {
    return localStorage.getItem(CUSTOM_RULES_KEY) || "";
  } catch {
    return "";
  }
}

export function setCustomRules(rules: string): void {
  localStorage.setItem(CUSTOM_RULES_KEY, rules);
}
