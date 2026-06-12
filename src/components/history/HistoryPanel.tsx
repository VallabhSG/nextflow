"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  History,
  Loader2,
} from "lucide-react";

export interface NodeRunDto {
  id: string;
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";
  inputs: Record<string, string> | null;
  outputs: Record<string, string> | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface RunDto {
  id: string;
  status: "RUNNING" | "SUCCESS" | "FAILED" | "PARTIAL";
  scope: "FULL" | "SINGLE" | "SELECTION";
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  nodeRuns: NodeRunDto[];
}

const RUN_STATUS_STYLE: Record<RunDto["status"], string> = {
  RUNNING: "bg-violet-500/15 text-violet-300 border-violet-500/40",
  SUCCESS: "bg-green-500/15 text-green-400 border-green-500/40",
  FAILED: "bg-red-500/15 text-red-400 border-red-500/40",
  PARTIAL: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40",
};

const NODE_STATUS_DOT: Record<NodeRunDto["status"], string> = {
  PENDING: "bg-zinc-600",
  RUNNING: "bg-violet-400 animate-pulse",
  SUCCESS: "bg-green-400",
  FAILED: "bg-red-400",
  SKIPPED: "bg-yellow-400",
};

const SCOPE_LABEL: Record<RunDto["scope"], string> = {
  FULL: "Full workflow",
  SINGLE: "Single node",
  SELECTION: "Selection",
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function truncate(value: string, max = 400): string {
  if (value.startsWith("data:image/")) return "[image data]";
  return value.length > max ? value.slice(0, max) + "…" : value;
}

function IoBlock({
  title,
  record,
}: {
  title: string;
  record: Record<string, string> | null;
}) {
  if (!record || Object.keys(record).length === 0) return null;
  return (
    <div className="mt-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {title}
      </p>
      {Object.entries(record).map(([key, value]) => (
        <div key={key} className="mt-0.5">
          <span className="text-[11px] text-zinc-500">{key}: </span>
          {typeof value === "string" && value.startsWith("data:image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt={key}
              className="mt-1 max-h-24 rounded border border-zinc-800"
            />
          ) : (
            <span className="break-words text-[11px] text-zinc-300">
              {truncate(String(value))}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function NodeRunRow({ nodeRun }: { nodeRun: NodeRunDto }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-zinc-500" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-zinc-500" />
        )}
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${NODE_STATUS_DOT[nodeRun.status]}`}
        />
        <span className="flex-1 truncate text-xs text-zinc-200">
          {nodeRun.nodeLabel}
        </span>
        <span className="text-[10px] text-zinc-500">
          {formatDuration(nodeRun.durationMs)}
        </span>
      </button>
      {open && (
        <div className="border-t border-zinc-800 px-3 py-2">
          <p className="text-[11px] text-zinc-400">
            Status:{" "}
            <span className="font-medium text-zinc-200">{nodeRun.status}</span>
            {" · "}Type:{" "}
            <span className="font-mono text-zinc-300">{nodeRun.nodeType}</span>
          </p>
          {nodeRun.error && (
            <p className="mt-1 break-words rounded bg-red-500/10 px-2 py-1 text-[11px] text-red-400">
              {nodeRun.error}
            </p>
          )}
          <IoBlock title="Inputs" record={nodeRun.inputs} />
          <IoBlock title="Outputs" record={nodeRun.outputs} />
        </div>
      )}
    </div>
  );
}

function RunCard({ run }: { run: RunDto }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        {run.status === "RUNNING" ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-400" />
        ) : open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${RUN_STATUS_STYLE[run.status]}`}
            >
              {run.status}
            </span>
            <span className="rounded border border-zinc-700 bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-400">
              {SCOPE_LABEL[run.scope]}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })}
            {" · "}
            {formatDuration(run.durationMs)}
          </p>
        </div>
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-zinc-800 px-3 py-2">
          {run.nodeRuns.map((nodeRun) => (
            <NodeRunRow key={nodeRun.id} nodeRun={nodeRun} />
          ))}
        </div>
      )}
    </div>
  );
}

interface HistoryPanelProps {
  runs: RunDto[];
  loading: boolean;
}

export function HistoryPanel({ runs, loading }: HistoryPanelProps) {
  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-zinc-800 bg-zinc-925 bg-zinc-900/40">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <History className="h-4 w-4 text-zinc-400" />
        <h2 className="text-sm font-semibold text-zinc-200">History</h2>
        {loading && (
          <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-zinc-500" />
        )}
      </div>
      <div className="panel-scroll flex-1 space-y-2 overflow-y-auto p-3">
        {runs.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-zinc-600">
            No runs yet. Execute the workflow to see its history here.
          </p>
        ) : (
          runs.map((run) => <RunCard key={run.id} run={run} />)
        )}
      </div>
    </aside>
  );
}
