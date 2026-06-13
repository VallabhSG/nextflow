"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  Workflow as WorkflowIcon,
  Sparkles,
} from "lucide-react";

interface WorkflowSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  _count: { runs: number };
  hasActiveRun: boolean;
}

export function WorkflowList() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<WorkflowSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<WorkflowSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    return fetch("/api/workflows")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load workflows");
        const body = (await res.json()) as { data: WorkflowSummary[] };
        setWorkflows(body.data);
      })
      .catch(() => {
        setError("Failed to load workflows");
        setWorkflows([]);
      });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function create(template: "empty" | "sample") {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:
            template === "sample" ? "Sample Social Post Pipeline" : "Untitled Workflow",
          template,
        }),
      });
      const body = (await res.json()) as {
        data?: { id: string };
        error?: string;
      };
      if (!res.ok || !body.data) {
        setError(body.error ?? "Failed to create workflow");
        return;
      }
      router.push(`/app/workflows/${body.data.id}/canvas`);
    } finally {
      setCreating(false);
    }
  }

  async function rename() {
    if (!renaming || !renameValue.trim()) return;
    const res = await fetch(`/api/workflows/${renaming.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameValue.trim() }),
    });
    if (!res.ok) setError("Failed to rename workflow");
    setRenaming(null);
    void refresh();
  }

  async function remove() {
    if (!deleting) return;
    const res = await fetch(`/api/workflows/${deleting.id}`, {
      method: "DELETE",
    });
    if (!res.ok) setError("Failed to delete workflow");
    setDeleting(null);
    void refresh();
  }

  return (
    <div onClick={() => setMenuFor(null)}>
      {error && (
        <p className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mb-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void create("empty")}
          disabled={creating}
          className="flex items-center gap-2 rounded-lg bg-[#6c5ce7] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#5a4bd1] disabled:opacity-50"
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          New workflow
        </button>
        <button
          type="button"
          onClick={() => void create("sample")}
          disabled={creating}
          className="flex items-center gap-2 rounded-lg border border-[#6c5ce7]/40 bg-[#6c5ce7]/10 px-4 py-2.5 text-sm font-semibold text-[#6c5ce7] hover:bg-[#6c5ce7]/20 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          New from sample (7 nodes)
        </button>
      </div>

      {workflows === null ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : workflows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 py-20 text-center">
          <WorkflowIcon className="mx-auto mb-3 h-8 w-8 text-zinc-300" />
          <p className="text-sm text-zinc-500">
            No workflows yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workflows.map((workflow) => (
            <div
              key={workflow.id}
              className="group relative cursor-pointer rounded-xl border border-zinc-200 bg-white shadow-sm p-4 transition hover:border-[#6c5ce7]/60"
              onClick={() =>
                router.push(`/app/workflows/${workflow.id}/canvas`)
              }
            >
              <div className="flex items-start justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#6c5ce7]/10 text-[#6c5ce7]">
                  <WorkflowIcon className="h-4.5 w-4.5" />
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuFor(menuFor === workflow.id ? null : workflow.id);
                  }}
                  className="rounded-md p-1.5 text-zinc-400 opacity-0 transition hover:bg-zinc-100 group-hover:opacity-100"
                  aria-label="Workflow menu"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-zinc-900">
                  {workflow.name}
                </h3>
                {workflow.hasActiveRun && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full border border-violet-300 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-600">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />
                    Running
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {workflow._count.runs} run{workflow._count.runs === 1 ? "" : "s"}
                {" · "}updated{" "}
                {formatDistanceToNow(new Date(workflow.updatedAt), {
                  addSuffix: true,
                })}
              </p>

              {menuFor === workflow.id && (
                <div
                  className="absolute right-3 top-12 z-10 w-36 rounded-lg border border-zinc-200 bg-white py-1 shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setRenaming(workflow);
                      setRenameValue(workflow.name);
                      setMenuFor(null);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-600 hover:bg-zinc-50"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleting(workflow);
                      setMenuFor(null);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Rename dialog */}
      {renaming && (
        <Dialog onClose={() => setRenaming(null)} title="Rename workflow">
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void rename()}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-[#6c5ce7]"
          />
          <div className="mt-4 flex justify-end gap-2">
            <DialogButton onClick={() => setRenaming(null)}>
              Cancel
            </DialogButton>
            <DialogButton primary onClick={() => void rename()}>
              Rename
            </DialogButton>
          </div>
        </Dialog>
      )}

      {/* Delete dialog */}
      {deleting && (
        <Dialog onClose={() => setDeleting(null)} title="Delete workflow">
          <p className="text-sm text-zinc-400">
            Delete <span className="font-semibold text-zinc-800">{deleting.name}</span>{" "}
            and all of its run history? This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <DialogButton onClick={() => setDeleting(null)}>
              Cancel
            </DialogButton>
            <DialogButton danger onClick={() => void remove()}>
              Delete
            </DialogButton>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function DialogButton({
  children,
  onClick,
  primary,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  const style = primary
    ? "bg-[#6c5ce7] text-white hover:bg-[#5a4bd1]"
    : danger
      ? "bg-red-600 text-white hover:bg-red-500"
      : "border border-zinc-700 text-zinc-600 hover:bg-zinc-50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3.5 py-1.5 text-xs font-medium ${style}`}
    >
      {children}
    </button>
  );
}
