"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import {
  ArrowLeft,
  Clock,
  Download,
  Loader2,
  Map,
  Play,
  Redo2,
  Save,
  Trash2,
  Undo2,
  Upload,
  Wallet,
  Zap,
} from "lucide-react";
import { useWorkflowStore } from "@/store/workflow-store";
import type { NodeKind, WorkflowGraph } from "@/lib/workflow/types";
import { workflowExportSchema } from "@/lib/workflow/types";
import { deriveRunState } from "@/lib/workflow/run-state";
import { RequestInputsNode } from "./nodes/RequestInputsNode";
import { CropImageNode } from "./nodes/CropImageNode";
import { GeminiNode } from "./nodes/GeminiNode";
import { ResponseNode } from "./nodes/ResponseNode";
import { NoteNode } from "./nodes/NoteNode";
import { AnimatedEdge } from "./AnimatedEdge";
import { NodePicker } from "./NodePicker";
import { CanvasSidebar } from "./CanvasSidebar";
import { HistoryPanel, type RunDto } from "@/components/history/HistoryPanel";

const nodeTypes: NodeTypes = {
  "request-inputs": RequestInputsNode,
  "crop-image": CropImageNode,
  gemini: GeminiNode,
  response: ResponseNode,
  note: NoteNode,
};

const edgeTypes: EdgeTypes = {
  animated: AnimatedEdge,
};

const POLL_MS = 1500;

interface WorkflowCanvasProps {
  workflowId: string;
  workflowName: string;
  graph: WorkflowGraph;
}

function CanvasInner({ workflowId, workflowName, graph }: WorkflowCanvasProps) {
  const store = useWorkflowStore();
  const { screenToFlowPosition } = useReactFlow();
  const [runs, setRuns] = useState<RunDto[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Load workflow into the store once.
  useEffect(() => {
    store.load(workflowId, workflowName, graph);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  // The store is a module-level singleton kept alive across client navigation.
  // Clear the live-run state when leaving the canvas so the next workflow we
  // open never flashes the previous run's "Final Output" before load() fires.
  useEffect(() => {
    return () => {
      useWorkflowStore.getState().resetRunState();
    };
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  // Auto-clear invalid-connection feedback (rendered straight from the store).
  useEffect(() => {
    if (!store.connectionError) return;
    const timer = window.setTimeout(
      () => store.setConnectionError(null),
      3500
    );
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.connectionError]);

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/workflows/${workflowId}/runs`);
      if (!res.ok) return;
      const body = (await res.json()) as { data: RunDto[] };
      setRuns(body.data);

      // Re-attach to a run that is still in progress (e.g. after a refresh or
      // navigating back to the canvas). Without this the run only shows up in
      // the history panel — the canvas node glows and run spinner stay idle.
      const newest = body.data[0];
      const state = useWorkflowStore.getState();
      if (newest && newest.status === "RUNNING" && !state.activeRunId) {
        const derived = deriveRunState(newest);
        state.setNodeStatuses(derived.statuses);
        state.setNodeOutputs(derived.outputs);
        if (derived.responseOutput) {
          state.setResponseOutput(derived.responseOutput);
        }
        state.setActiveRunId(newest.id);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  // Poll the active run for live node statuses + outputs.
  useEffect(() => {
    if (!store.activeRunId) return;
    const runId = store.activeRunId;
    const interval = window.setInterval(async () => {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) return;
      const body = (await res.json()) as { data: RunDto };
      const run = body.data;

      const derived = deriveRunState(run);
      store.setNodeStatuses(derived.statuses);
      store.setNodeOutputs({ ...store.nodeOutputs, ...derived.outputs });
      if (derived.responseOutput) {
        store.setResponseOutput(derived.responseOutput);
      }

      if (run.status !== "RUNNING") {
        store.setActiveRunId(null);
        void refreshHistory();
        showToast(
          run.status === "SUCCESS"
            ? "Run completed successfully"
            : run.status === "PARTIAL"
              ? "Run finished with some failures"
              : "Run failed"
        );
      }
    }, POLL_MS);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.activeRunId]);

  const save = useCallback(async (): Promise<boolean> => {
    // Read the freshest state at call time so the debounced auto-save never
    // persists a stale snapshot captured when the timer was scheduled.
    const state = useWorkflowStore.getState();
    setSaving(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: state.workflowName,
          graph: state.toGraph(),
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        showToast(body.error ?? "Failed to save");
        return false;
      }
      state.markSaved();
      return true;
    } finally {
      setSaving(false);
    }
  }, [workflowId, showToast]);

  // Auto-save: debounce edits and persist 2s after the last change. `dirty`
  // flips false on save, so a settled canvas schedules no further saves.
  useEffect(() => {
    if (!store.dirty) return;
    const timer = window.setTimeout(() => void save(), 2000);
    return () => window.clearTimeout(timer);
  }, [store.dirty, store.nodes, store.edges, store.workflowName, save]);

  const run = useCallback(
    async (nodeIds?: string[]) => {
      const state = useWorkflowStore.getState();
      if (state.activeRunId) return;
      const res = await fetch(`/api/workflows/${workflowId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeIds, graph: state.toGraph() }),
      });
      const body = (await res.json()) as {
        data?: { runId: string };
        error?: string;
      };
      if (!res.ok || !body.data) {
        showToast(body.error ?? "Failed to start run");
        return;
      }
      state.markSaved();
      const pending: Record<string, "PENDING"> = {};
      for (const id of nodeIds ?? state.nodes.map((n) => n.id)) {
        pending[id] = "PENDING";
      }
      state.setNodeStatuses(pending);
      state.setActiveRunId(body.data.runId);
      void refreshHistory();
    },
    [workflowId, showToast, refreshHistory]
  );

  // Let node components trigger single-node runs.
  useEffect(() => {
    store.setRunHandler((nodeIds) => void run(nodeIds));
    return () => store.setRunHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  // Keyboard shortcuts: undo/redo.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        store.undo();
      } else if (
        (mod && event.key.toLowerCase() === "y") ||
        (mod && event.shiftKey && event.key.toLowerCase() === "z")
      ) {
        event.preventDefault();
        store.redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addNode = useCallback(
    (kind: NodeKind) => {
      const bounds = wrapperRef.current?.getBoundingClientRect();
      const position = screenToFlowPosition({
        x: (bounds?.left ?? 0) + (bounds?.width ?? 800) / 2,
        y: (bounds?.top ?? 0) + (bounds?.height ?? 600) / 2,
      });
      store.addNode(kind, position);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [screenToFlowPosition]
  );

  const addNote = useCallback(() => {
    const bounds = wrapperRef.current?.getBoundingClientRect();
    const position = screenToFlowPosition({
      x: (bounds?.left ?? 0) + (bounds?.width ?? 800) / 2,
      y: (bounds?.top ?? 0) + (bounds?.height ?? 600) / 2,
    });
    store.addNote(position);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenToFlowPosition]);

  const exportJson = useCallback(() => {
    const state = useWorkflowStore.getState();
    const payload = {
      version: 1 as const,
      name: state.workflowName,
      graph: state.toGraph(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${state.workflowName.replace(/\s+/g, "-").toLowerCase() || "workflow"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const importJson = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const parsed = workflowExportSchema.parse(
          JSON.parse(await file.text())
        );
        const state = useWorkflowStore.getState();
        state.pushHistory();
        state.load(workflowId, parsed.name, parsed.graph);
        state.setWorkflowName(parsed.name);
        showToast("Workflow imported — remember to save");
      } catch {
        showToast("Invalid workflow JSON");
      }
    },
    [workflowId, showToast]
  );

  const selectedIds = store.nodes.filter((n) => n.selected).map((n) => n.id);
  const selectedDeletable = store.nodes.filter(
    (n) => n.selected && n.deletable !== false
  );
  const running = Boolean(store.activeRunId);
  const executableNodes = store.nodes.filter(
    (n) => n.type === "gemini" || n.type === "crop-image"
  );
  const executableCount = executableNodes.length;
  // Estimated run cost (credits, millions) — mirrors the per-node estimates.
  const estCost = executableNodes.reduce(
    (sum, n) => sum + (n.type === "crop-image" ? 0.001 : 0.0001),
    0
  );

  return (
    <div className="flex h-screen bg-white">
      <CanvasSidebar
        onOpenPicker={() => setPickerOpen(true)}
        historyOpen={historyOpen}
        onToggleHistory={() => setHistoryOpen((v) => !v)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          {/* Canvas */}
          <div ref={wrapperRef} className="relative min-w-0 flex-1">
            <ReactFlow
              nodes={store.nodes}
              edges={store.edges}
              onNodesChange={store.onNodesChange}
              onEdgesChange={store.onEdgesChange}
              onConnect={store.onConnect}
              isValidConnection={store.isValidConnection}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              minZoom={0.15}
              maxZoom={2}
              deleteKeyCode={["Backspace", "Delete"]}
              multiSelectionKeyCode={["Control", "Meta"]}
              selectionKeyCode={["Shift"]}
              proOptions={{ hideAttribution: true }}
              colorMode="light"
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1.5}
                color="#d4d4d8"
              />
              <Controls position="bottom-left" />
              {minimapOpen && (
                <MiniMap
                  position="bottom-right"
                  pannable
                  zoomable
                  nodeColor="#c7c2f4"
                  maskColor="rgba(247, 247, 248, 0.8)"
                />
              )}
            </ReactFlow>

            {/* Minimap toggle (bottom-right), matching the reference */}
            <button
              type="button"
              onClick={() => setMinimapOpen((v) => !v)}
              className={`absolute right-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg border shadow-sm transition ${
                minimapOpen
                  ? "bottom-[172px] border-[#6c5ce7]/40 bg-[#6c5ce7]/10 text-[#6c5ce7]"
                  : "bottom-4 border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"
              }`}
              title={minimapOpen ? "Hide minimap" : "Show minimap"}
            >
              <Map className="h-4 w-4" />
            </button>

            {/* Floating top-left: back + editable title pill */}
            <div className="absolute left-4 top-4 z-10 flex items-center gap-1 rounded-full border border-zinc-200 bg-white py-1 pl-1 pr-3 shadow-sm">
              <Link
                href="/app/workflows"
                className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <input
                value={store.workflowName}
                onChange={(e) => store.setWorkflowName(e.target.value)}
                className="w-52 bg-transparent text-[13px] font-semibold text-zinc-800 outline-none"
              />
              {store.dirty && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" title="Unsaved changes" />
              )}
            </div>

            {/* Floating top-right: stats + actions */}
            <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
              <span
                className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] text-zinc-600 shadow-sm"
                title={`Estimated run cost across ${executableCount} task${executableCount === 1 ? "" : "s"}`}
              >
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                <span className="font-medium text-zinc-500">Est</span>
                <span className="font-semibold text-zinc-800">
                  {estCost >= 0.01 ? estCost.toFixed(2) : estCost.toFixed(4)}
                </span>
                <span className="text-zinc-400">M</span>
              </span>
              <span
                className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] text-zinc-600 shadow-sm"
                title="Credit balance"
              >
                <Wallet className="h-3.5 w-3.5 text-zinc-400" />
                <span className="font-medium text-zinc-500">Bal</span>
                <span className="font-semibold text-zinc-800">0.00</span>
                <span className="text-zinc-400">M</span>
              </span>

              <div className="mx-0.5 h-5 w-px bg-zinc-200" />

              <button
                type="button"
                onClick={() => store.undo()}
                disabled={store.past.length === 0}
                className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 shadow-sm hover:bg-zinc-50 disabled:opacity-40"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => store.redo()}
                disabled={store.future.length === 0}
                className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 shadow-sm hover:bg-zinc-50 disabled:opacity-40"
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => store.deleteNodes(selectedIds)}
                disabled={selectedDeletable.length === 0}
                className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 shadow-sm hover:bg-zinc-50 hover:text-red-500 disabled:opacity-40"
                title="Delete selected (Backspace)"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={exportJson}
                className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 shadow-sm hover:bg-zinc-50"
                title="Export JSON"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => importRef.current?.click()}
                className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 shadow-sm hover:bg-zinc-50"
                title="Import JSON"
              >
                <Upload className="h-3.5 w-3.5" />
              </button>
              <input
                ref={importRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  void importJson(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !store.dirty}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-40"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save
              </button>

              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => void run(selectedIds)}
                  disabled={running}
                  className="flex items-center gap-1.5 rounded-lg border border-[#6c5ce7]/40 bg-[#6c5ce7]/10 px-3 py-1.5 text-xs font-semibold text-[#6c5ce7] shadow-sm hover:bg-[#6c5ce7]/20 disabled:opacity-40"
                >
                  <Play className="h-3.5 w-3.5" />
                  Run{" "}
                  {selectedIds.length === 1
                    ? "node"
                    : `${selectedIds.length} nodes`}
                </button>
              )}

              <button
                type="button"
                onClick={() => void run()}
                disabled={running}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#6c5ce7] text-white shadow-sm transition hover:bg-[#5a4bd1] disabled:opacity-50"
                title="Run workflow"
              >
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 fill-current" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border shadow-sm transition ${
                  historyOpen
                    ? "border-[#6c5ce7]/40 bg-[#6c5ce7]/10 text-[#6c5ce7]"
                    : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"
                }`}
                title="Toggle run history"
              >
                <Clock className="h-4 w-4" />
              </button>
            </div>

            <NodePicker
              onAdd={addNode}
              onAddNote={addNote}
              open={pickerOpen}
              onOpenChange={setPickerOpen}
            />

            {(toast ?? store.connectionError) && (
              <div className="absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs text-zinc-700 shadow-xl">
                {toast ?? store.connectionError}
              </div>
            )}
          </div>

          {historyOpen && <HistoryPanel runs={runs} loading={historyLoading} />}
        </div>
      </div>
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
