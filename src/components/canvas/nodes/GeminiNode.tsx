"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Sparkles } from "lucide-react";
import type { GeminiData } from "@/lib/workflow/types";
import { NODE_SPECS } from "@/lib/workflow/types";
import { useWorkflowStore } from "@/store/workflow-store";
import {
  NodeOutput,
  NodeShell,
  fieldLabelClass,
  inputClass,
} from "./NodeShell";

const INPUT_PORTS = NODE_SPECS.gemini.inputs;
const PORT_SPACING = 24;
const PORTS_TOP = 48;

export function GeminiNode({
  id,
  data,
  selected,
}: NodeProps & { data: GeminiData }) {
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);

  return (
    <NodeShell
      nodeId={id}
      title={data.label}
      icon={<Sparkles className="h-3.5 w-3.5" />}
      accent="#6c5ce7"
      selected={selected}
      runnable
      deletable
      width={290}
    >
      {/* Input ports along the left edge, one per labeled row */}
      {INPUT_PORTS.map((port, i) => (
        <Handle
          key={port.id}
          type="target"
          position={Position.Left}
          id={port.id}
          className={`handle-${port.dataType}`}
          style={{ top: PORTS_TOP + i * PORT_SPACING }}
        />
      ))}
      <Handle
        type="source"
        position={Position.Right}
        id="text"
        className="handle-text"
        style={{ top: 22 }}
      />

      <div className="mb-2">
        {INPUT_PORTS.map((port) => (
          <div
            key={port.id}
            className="text-[10px] text-zinc-500"
            style={{ height: PORT_SPACING, lineHeight: `${PORT_SPACING}px` }}
          >
            {port.label}
            {port.id === "prompt" ? " *" : ""}
          </div>
        ))}
      </div>

      <label className={fieldLabelClass}>Label</label>
      <input
        value={data.label}
        onChange={(e) => updateNodeData(id, { label: e.target.value })}
        className={`${inputClass} mb-2`}
      />

      <label className={fieldLabelClass}>Prompt *</label>
      <textarea
        value={data.prompt}
        onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
        rows={3}
        placeholder="Enter your prompt…"
        className={`${inputClass} mb-2 resize-none`}
      />

      <label className={fieldLabelClass}>System Prompt</label>
      <textarea
        value={data.systemPrompt}
        onChange={(e) => updateNodeData(id, { systemPrompt: e.target.value })}
        rows={2}
        placeholder="Optional system instruction…"
        className={`${inputClass} resize-none`}
      />

      <NodeOutput nodeId={id} outputKey="text" label="Response" />
    </NodeShell>
  );
}
