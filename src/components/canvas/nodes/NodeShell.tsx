"use client";

import { useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Coins,
  Copy,
  Loader2,
  MinusCircle,
  MoreHorizontal,
  Play,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  useWorkflowStore,
  type NodeRuntimeStatus,
} from "@/store/workflow-store";

interface NodeShellProps {
  nodeId: string;
  title: string;
  icon: ReactNode;
  accent: string;
  selected?: boolean;
  /** Shows the green per-node Run pill (executable nodes only). */
  runnable?: boolean;
  /** Shows the "..." menu with Delete (mandatory nodes hide it). */
  deletable?: boolean;
  children: ReactNode;
  width?: number;
  headerExtra?: ReactNode;
  /** Estimated run cost in credits (millions), shown as a footer like Magica. */
  cost?: number;
}

function StatusBadge({ status }: { status?: NodeRuntimeStatus }) {
  if (!status || status === "PENDING") return null;
  if (status === "RUNNING") {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-[#6c5ce7]" />;
  }
  if (status === "SUCCESS") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
  }
  if (status === "FAILED") {
    return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  }
  return <MinusCircle className="h-3.5 w-3.5 text-yellow-500" />;
}

/** Shared chrome for all workflow nodes: white Magica-style card. */
export function NodeShell({
  nodeId,
  title,
  icon,
  accent,
  selected,
  runnable,
  deletable,
  children,
  width = 280,
  headerExtra,
  cost,
}: NodeShellProps) {
  const status = useWorkflowStore((s) => s.nodeStatuses[nodeId]);
  const runHandler = useWorkflowStore((s) => s.runHandler);
  const deleteNodes = useWorkflowStore((s) => s.deleteNodes);
  const running = useWorkflowStore((s) => Boolean(s.activeRunId));
  const [menuOpen, setMenuOpen] = useState(false);

  const glow =
    status === "RUNNING"
      ? "node-glow-running"
      : status === "SUCCESS"
        ? "node-glow-success"
        : status === "FAILED"
          ? "node-glow-failed"
          : "";

  return (
    <div
      style={{ width }}
      className={`rounded-xl border bg-white text-zinc-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] transition-colors ${
        selected ? "border-[#6c5ce7]" : "border-zinc-200"
      } ${glow}`}
    >
      <div className="flex items-center gap-1.5 rounded-t-xl border-b border-zinc-100 px-3 py-2">
        <span
          className="flex h-5 w-5 items-center justify-center rounded"
          style={{ color: accent }}
        >
          {icon}
        </span>
        <span className="flex-1 truncate text-[12px] font-semibold">
          {title}
        </span>
        <StatusBadge status={status} />
        {headerExtra}
        {runnable && (
          <button
            type="button"
            disabled={running}
            onClick={() => runHandler?.([nodeId])}
            className="nodrag flex items-center gap-1 rounded-md bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-600 hover:bg-green-500/25 disabled:opacity-40"
            title="Run this node"
          >
            <Play className="h-2.5 w-2.5 fill-current" /> Run
          </button>
        )}
        {deletable && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="nodrag rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              aria-label="Node menu"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <div className="nodrag absolute right-0 top-6 z-20 w-32 rounded-lg border border-zinc-200 bg-white py-1 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    navigator.clipboard
                      ?.writeText(nodeId)
                      .catch(() => undefined);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] text-zinc-600 hover:bg-zinc-50"
                >
                  <Copy className="h-3 w-3" /> Copy node id
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    deleteNodes([nodeId]);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="px-3 py-2.5">{children}</div>
      {cost !== undefined && (
        <div className="flex items-center justify-end gap-1 border-t border-zinc-100 px-3 py-1.5 text-[10px] text-zinc-400">
          <Coins className="h-3 w-3" />~{cost.toFixed(4)}M
        </div>
      )}
    </div>
  );
}

/** Output section shown at the bottom of executable nodes. */
export function NodeOutput({
  nodeId,
  outputKey,
  label = "Response",
}: {
  nodeId: string;
  outputKey: string;
  label?: string;
}) {
  const output = useWorkflowStore((s) => s.nodeOutputs[nodeId]?.[outputKey]);
  const isImage = output?.startsWith("data:image/") || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(output ?? "");

  return (
    <div className="mt-2 border-t border-zinc-100 pt-2">
      <p className={fieldLabelClass}>{label}</p>
      {output ? (
        isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={output}
            alt="Node output"
            className="max-h-32 w-full rounded-md border border-zinc-200 object-contain"
          />
        ) : (
          <div className="panel-scroll max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[11px] leading-relaxed text-zinc-700">
            {output}
          </div>
        )
      ) : (
        <div className="flex h-14 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-[11px] text-zinc-400">
          No output yet
        </div>
      )}
    </div>
  );
}

export const fieldLabelClass =
  "mb-1 block text-[10px] font-semibold tracking-wide text-zinc-500";
export const inputClass =
  "nodrag w-full rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-[#6c5ce7] focus:bg-white";
