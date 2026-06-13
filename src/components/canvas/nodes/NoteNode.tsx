"use client";

import { NodeResizer, type NodeProps } from "@xyflow/react";
import { Trash2 } from "lucide-react";
import type { NoteData } from "@/lib/workflow/types";
import { useWorkflowStore } from "@/store/workflow-store";

const DEFAULT_WIDTH = 220;
const DEFAULT_HEIGHT = 150;

/**
 * Free-floating sticky note. Not part of the executable graph — no handles,
 * never triggers a run. Resizable and editable in place.
 */
export function NoteNode({
  id,
  data,
  selected,
}: NodeProps & { data: NoteData }) {
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const deleteNodes = useWorkflowStore((s) => s.deleteNodes);

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={100}
        lineClassName="!border-amber-400"
        handleClassName="!h-2 !w-2 !rounded-sm !border-amber-500 !bg-white"
        onResizeEnd={(_, params) =>
          updateNodeData(id, { width: params.width, height: params.height })
        }
      />
      <div
        style={{
          width: data.width ?? DEFAULT_WIDTH,
          height: data.height ?? DEFAULT_HEIGHT,
        }}
        className={`group flex h-full flex-col rounded-md border bg-amber-100 shadow-[0_1px_4px_rgba(0,0,0,0.08)] transition-colors ${
          selected ? "border-amber-400" : "border-amber-200"
        }`}
      >
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-700/70">
            Note
          </span>
          <button
            type="button"
            onClick={() => deleteNodes([id])}
            className="nodrag text-amber-700/50 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
            aria-label="Delete note"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
        <textarea
          value={data.text}
          onChange={(e) => updateNodeData(id, { text: e.target.value })}
          placeholder="Type a note..."
          className="nodrag nowheel flex-1 resize-none rounded-b-md bg-transparent px-2.5 pb-2 text-xs leading-relaxed text-amber-900 outline-none placeholder:text-amber-700/40"
        />
      </div>
    </>
  );
}
