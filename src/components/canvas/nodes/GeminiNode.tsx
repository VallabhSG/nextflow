"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import type { GeminiData } from "@/lib/workflow/types";
import { GEMINI_MODELS, NODE_SPECS } from "@/lib/workflow/types";
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
  const edges = useWorkflowStore((s) => s.edges);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Connected handles grey out their manual entry fields.
  const connected = new Set(
    edges.filter((e) => e.target === id).map((e) => e.targetHandle)
  );
  const promptConnected = connected.has("prompt");
  const systemConnected = connected.has("system");

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
      cost={0.0001}
      headerExtra={
        <select
          value={data.model ?? ""}
          onChange={(e) =>
            updateNodeData(id, { model: e.target.value || undefined })
          }
          className="nodrag rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 text-[10px] text-zinc-600 outline-none focus:border-[#6c5ce7]"
          title="Model"
        >
          <option value="">default model</option>
          {GEMINI_MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      }
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
            className={`text-[10px] ${
              connected.has(port.id) ? "font-medium text-[#6c5ce7]" : "text-zinc-500"
            }`}
            style={{ height: PORT_SPACING, lineHeight: `${PORT_SPACING}px` }}
          >
            {port.label}
            {port.required ? " *" : ""}
            {connected.has(port.id) &&
              ` · connected${
                port.multi
                  ? ` (${edges.filter((e) => e.target === id && e.targetHandle === port.id).length})`
                  : ""
              }`}
          </div>
        ))}
      </div>

      <label className={fieldLabelClass}>Prompt *</label>
      <textarea
        value={data.prompt}
        onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
        rows={3}
        placeholder={
          promptConnected ? "Using connected input" : "Enter your prompt…"
        }
        disabled={promptConnected}
        className={`${inputClass} mb-2 resize-none disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400`}
      />

      <label className={fieldLabelClass}>System Prompt</label>
      <textarea
        value={data.systemPrompt}
        onChange={(e) => updateNodeData(id, { systemPrompt: e.target.value })}
        rows={2}
        placeholder={
          systemConnected
            ? "Using connected input"
            : "Optional system instruction…"
        }
        disabled={systemConnected}
        className={`${inputClass} resize-none disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400`}
      />

      {/* Collapsed Settings section (per reference UI) */}
      <button
        type="button"
        onClick={() => setSettingsOpen((v) => !v)}
        className="nodrag mt-2 flex items-center gap-1 text-[10px] font-medium text-zinc-500 hover:text-zinc-700"
      >
        {settingsOpen ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        Settings
      </button>
      {settingsOpen && (
        <div className="mt-1.5 space-y-1.5 rounded-md border border-zinc-100 bg-zinc-50 px-2.5 py-2">
          <label className={fieldLabelClass}>Label</label>
          <input
            value={data.label}
            onChange={(e) => updateNodeData(id, { label: e.target.value })}
            className={inputClass}
          />
          <p className="text-[10px] text-zinc-400">
            Runs as a Trigger.dev task · model {data.model ?? "default (env)"}
          </p>
        </div>
      )}

      <NodeOutput nodeId={id} outputKey="text" label="Response" />
    </NodeShell>
  );
}
