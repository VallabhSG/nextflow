"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MessageSquareReply } from "lucide-react";
import type { ResponseData } from "@/lib/workflow/types";
import { useWorkflowStore } from "@/store/workflow-store";
import { NodeShell, fieldLabelClass } from "./NodeShell";

export function ResponseNode({
  id,
  data,
  selected,
}: NodeProps & { data: ResponseData }) {
  const output = useWorkflowStore((s) => s.responseOutput);

  return (
    <NodeShell
      nodeId={id}
      title={data.label}
      icon={<MessageSquareReply className="h-3.5 w-3.5" />}
      accent="#22c55e"
      selected={selected}
      width={290}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="handle-text"
        style={{ top: 48 }}
      />
      <p className="text-[10px] leading-6 text-zinc-500">result</p>
      <p className={fieldLabelClass}>Final Output</p>
      <div className="panel-scroll max-h-48 min-h-[56px] overflow-y-auto whitespace-pre-wrap rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-xs leading-relaxed text-zinc-700">
        {output || <span className="text-zinc-400">No output yet</span>}
      </div>
    </NodeShell>
  );
}
