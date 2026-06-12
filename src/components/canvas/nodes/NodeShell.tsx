"use client";

import { type ReactNode } from "react";
import { Loader2, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
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
  children: ReactNode;
  width?: number;
}

function StatusBadge({ status }: { status?: NodeRuntimeStatus }) {
  if (!status || status === "PENDING") return null;
  if (status === "RUNNING") {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />;
  }
  if (status === "SUCCESS") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />;
  }
  if (status === "FAILED") {
    return <XCircle className="h-3.5 w-3.5 text-red-400" />;
  }
  return <MinusCircle className="h-3.5 w-3.5 text-yellow-400" />;
}

/** Shared chrome for all workflow nodes: header, glow states, status. */
export function NodeShell({
  nodeId,
  title,
  icon,
  accent,
  selected,
  children,
  width = 280,
}: NodeShellProps) {
  const status = useWorkflowStore((s) => s.nodeStatuses[nodeId]);

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
      className={`rounded-xl border bg-zinc-900/95 backdrop-blur text-zinc-100 shadow-lg transition-colors ${
        selected ? "border-violet-500" : "border-zinc-700"
      } ${glow}`}
    >
      <div className="flex items-center gap-2 rounded-t-xl border-b border-zinc-800 px-3 py-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-md"
          style={{ backgroundColor: `${accent}26`, color: accent }}
        >
          {icon}
        </span>
        <span className="flex-1 truncate text-[13px] font-semibold">
          {title}
        </span>
        <StatusBadge status={status} />
      </div>
      <div className="px-3 py-2.5">{children}</div>
    </div>
  );
}

export const fieldLabelClass =
  "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500";
export const inputClass =
  "nodrag w-full rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-1.5 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-violet-500";
