"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MessageSquareReply } from "lucide-react";
import type { ResponseData } from "@/lib/workflow/types";
import { useWorkflowStore } from "@/store/workflow-store";
import { NodeShell } from "./NodeShell";

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
      width={300}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="handle-text"
        style={{ top: 22 }}
      />
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Final Output
      </p>
      <div className="panel-scroll max-h-44 min-h-[48px] overflow-y-auto whitespace-pre-wrap rounded-md border border-zinc-800 bg-zinc-950/60 px-2.5 py-2 text-xs leading-relaxed text-zinc-300">
        {output || (
          <span className="text-zinc-600">
            Run the workflow to see the final output here.
          </span>
        )}
      </div>
    </NodeShell>
  );
}
