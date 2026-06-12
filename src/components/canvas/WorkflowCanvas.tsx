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
  Download,
  Loader2,
  Play,
  Redo2,
  Save,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { useWorkflowStore } from "@/store/workflow-store";
import type { NodeKind, WorkflowGraph } from "@/lib/workflow/types";
import { workflowExportSchema } from "@/lib/workflow/types";
import { RequestInputsNode } from "./nodes/RequestInputsNode";
import { CropImageNode } from "./nodes/CropImageNode";
import { GeminiNode } from "./nodes/GeminiNode";
import { ResponseNode } from "./nodes/ResponseNode";
import { AnimatedEdge } from "./AnimatedEdge";
import { NodePicker } from "./NodePicker";
import { HistoryPanel, type RunDto } from "@/components/history/HistoryPanel";

const nodeTypes: NodeTypes = {
  "request-inputs": RequestInputsNode,
  "crop-image": CropImageNode,
  gemini: GeminiNode,
  response: ResponseNode,
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
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Load workflow into the store once.
  useEffect(() => {
    store.load(workflowId, workflowName, graph);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

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
    } finally {
      setHistoryLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  // Poll the active run for live node statuses.
  useEffect(() => {
    if (!store.activeRunId) return;
    const runId = store.activeRunId;
    const interval = window.setInterval(async () => {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) return;
      const body = (await res.json()) as {
        data: RunDto & { nodeRuns: RunDto["nodeRuns"] };
      };
      const run = body.data;
      const statuses: Record<string, RunDto["nodeRuns"][number]["status"]> = {};
      for (const nr of run.nodeRuns) statuses[nr.nodeId] = nr.status;
      store.setNodeStatuses(statuses);

      const responseRun = run.nodeRuns.find(
        (nr) => nr.nodeType === "response"
      );
      if (responseRun?.outputs?.output) {
        store.setResponseOutput(responseRun.outputs.output);
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
    setSaving(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: store.workflowName,
          graph: store.toGraph(),
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        showToast(body.error ?? "Failed to save");
        return false;
      }
      store.markSaved();
      return true;
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, showToast]);

  const run = useCallback(
    async (nodeIds?: string[]) => {
      if (store.activeRunId) return;
      const res = await fetch(`/api/workflows/${workflowId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeIds, graph: store.toGraph() }),
      });
      const body = (await res.json()) as {
        data?: { runId: string };
        error?: string;
      };
      if (!res.ok || !body.data) {
        showToast(body.error ?? "Failed to start run");
        return;
      }
      store.markSaved();
      const pending: Record<string, "PENDING"> = {};
      for (const id of nodeIds ?? store.nodes.map((n) => n.id)) {
        pending[id] = "PENDING";
      }
      store.setNodeStatuses(pending);
      store.setActiveRunId(body.data.runId);
      void refreshHistory();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workflowId, showToast, refreshHistory]
  );

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

  const exportJson = useCallback(() => {
    const payload = {
      version: 1 as const,
      name: store.workflowName,
      graph: store.toGraph(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${store.workflowName.replace(/\s+/g, "-").toLowerCase() || "workflow"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const importJson = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const parsed = workflowExportSchema.parse(
          JSON.parse(await file.text())
        );
        store.pushHistory();
        store.load(workflowId, parsed.name, parsed.graph);
        store.setWorkflowName(parsed.name);
        showToast("Workflow imported — remember to save");
      } catch {
        showToast("Invalid workflow JSON");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workflowId, showToast]
  );

  const selectedIds = store.nodes.filter((n) => n.selected).map((n) => n.id);
  const selectedDeletable = store.nodes.filter(
    (n) => n.selected && n.deletable !== false
  );
  const running = Boolean(store.activeRunId);

  return (
    <div className="flex h-screen flex-col">
      {/* Toolbar */}
      <header className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-900/70 px-4 py-2.5">
        <Link
          href="/app/workflows"
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <input
          value={store.workflowName}
          onChange={(e) => store.setWorkflowName(e.target.value)}
          className="w-64 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-zinc-100 outline-none hover:border-zinc-700 focus:border-violet-500"
        />
        {store.dirty && (
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            Unsaved
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => store.undo()}
            disabled={store.past.length === 0}
            className="rounded-md p-2 text-zinc-400 hover:bg-zinc-800 disabled:opacity-40"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => store.redo()}
            disabled={store.future.length === 0}
            className="rounded-md p-2 text-zinc-400 hover:bg-zinc-800 disabled:opacity-40"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => store.deleteNodes(selectedIds)}
            disabled={selectedDeletable.length === 0}
            className="rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-red-400 disabled:opacity-40"
            title="Delete selected (Backspace)"
          >
            <Trash2 className="h-4 w-4" />
          </button>

          <div className="mx-1 h-5 w-px bg-zinc-800" />

          <button
            type="button"
            onClick={exportJson}
            className="rounded-md p-2 text-zinc-400 hover:bg-zinc-800"
            title="Export JSON"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            className="rounded-md p-2 text-zinc-400 hover:bg-zinc-800"
            title="Import JSON"
          >
            <Upload className="h-4 w-4" />
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

          <div className="mx-1 h-5 w-px bg-zinc-800" />

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !store.dirty}
            className="flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
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
              className="flex items-center gap-1.5 rounded-md border border-violet-600/60 bg-violet-600/15 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-600/25 disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5" />
              Run {selectedIds.length === 1 ? "node" : `${selectedIds.length} nodes`}
            </button>
          )}

          <button
            type="button"
            onClick={() => void run()}
            disabled={running}
            className="flex items-center gap-1.5 rounded-md bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {running ? "Running…" : "Run workflow"}
          </button>

          <div className="ml-2">
            <UserButton />
          </div>
        </div>
      </header>

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
            colorMode="dark"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1.5}
              color="#3f3f46"
            />
            <Controls position="bottom-left" />
            <MiniMap
              position="top-right"
              pannable
              zoomable
              nodeColor="#6d28d9"
              maskColor="rgba(9, 9, 11, 0.75)"
            />
          </ReactFlow>

          <NodePicker onAdd={addNode} />

          {(toast ?? store.connectionError) && (
            <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs text-zinc-200 shadow-xl">
              {toast ?? store.connectionError}
            </div>
          )}
        </div>

        <HistoryPanel runs={runs} loading={historyLoading} />
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
