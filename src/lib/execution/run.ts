import { tasks } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/prisma";
import {
  buildInvokePayload,
  runWorkflowGraph,
  toNodeOutputs,
  type NodeOutputs,
} from "./scheduler";
import {
  executeCropImage,
  executeGemini,
  type CropImagePayload,
  type GeminiPayload,
} from "./executors";
import type { WorkflowGraph } from "@/lib/workflow/types";
import type { WorkflowRunPayload } from "@/trigger/workflow-run";
import type { RunScope } from "@prisma/client";

export interface StartRunOptions {
  workflowId: string;
  userId: string;
  graph: WorkflowGraph;
  /** Node ids to execute. Empty/omitted = full workflow. */
  selectedIds?: string[];
}

/**
 * Absolute safety cap for a single node in the in-process dev runner. Crop
 * nodes have a mandatory 30s delay plus FFmpeg work, so this is generously
 * above that. Without it, a hung fetch / FFmpeg / Gemini call would leave the
 * run RUNNING forever with no timeout and no error. The production Trigger.dev
 * path has its own `maxDuration` + poll timeout and is unaffected.
 */
const NODE_TIMEOUT_MS = 5 * 60 * 1000;

/** Reject if `promise` does not settle within `ms`, producing a clear error. */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function scopeFor(selectedIds: string[] | undefined, total: number): RunScope {
  if (!selectedIds || selectedIds.length === 0 || selectedIds.length === total)
    return "FULL";
  return selectedIds.length === 1 ? "SINGLE" : "SELECTION";
}

/**
 * Latest successful outputs per node, used to feed inputs of selected
 * nodes whose upstream is not part of this run.
 */
async function latestOutputs(
  workflowId: string
): Promise<Record<string, NodeOutputs>> {
  const nodeRuns = await prisma.nodeRun.findMany({
    where: {
      status: "SUCCESS",
      run: { workflowId },
    },
    orderBy: { finishedAt: "desc" },
    take: 200,
    select: { nodeId: true, outputs: true },
  });
  const result: Record<string, NodeOutputs> = {};
  for (const nr of nodeRuns) {
    if (!(nr.nodeId in result) && nr.outputs) {
      result[nr.nodeId] = nr.outputs as NodeOutputs;
    }
  }
  return result;
}

export async function startRun(options: StartRunOptions): Promise<string> {
  const { workflowId, userId, graph, selectedIds } = options;

  // Notes are canvas annotations, never executed.
  const runnable = graph.nodes.filter((n) => n.type !== "note");

  const includeIds =
    selectedIds && selectedIds.length > 0
      ? selectedIds.filter((id) =>
          runnable.some((n) => n.id === id)
        )
      : runnable.map((n) => n.id);

  const scope = scopeFor(selectedIds, runnable.length);

  const run = await prisma.workflowRun.create({
    data: {
      workflowId,
      userId,
      scope,
      nodeIds: includeIds,
      nodeRuns: {
        create: includeIds.map((nodeId) => {
          const node = graph.nodes.find((n) => n.id === nodeId)!;
          return {
            nodeId,
            nodeType: node.type,
            nodeLabel:
              (node.data as { label?: string }).label ?? node.type,
            status: "PENDING" as const,
          };
        }),
      },
    },
  });

  const cachedOutputs = await latestOutputs(workflowId);

  const payload: WorkflowRunPayload = {
    runId: run.id,
    graph,
    includeIds,
    cachedOutputs,
  };

  if (process.env.TRIGGER_SECRET_KEY) {
    await tasks.trigger("workflow-run", payload);
  } else {
    // Dev fallback: execute in-process so the app works without
    // Trigger.dev credentials. Fire and forget; client polls the DB.
    void runLocally(payload).catch(async (error) => {
      await prisma.workflowRun.update({
        where: { id: run.id },
        data: { status: "FAILED", finishedAt: new Date() },
      });
      console.error("[NextFlow] Local run failed:", error);
    });
  }

  return run.id;
}

async function runLocally(payload: WorkflowRunPayload): Promise<void> {
  await runWorkflowGraph({
    runId: payload.runId,
    graph: payload.graph as WorkflowGraph,
    includeIds: new Set(payload.includeIds),
    cachedOutputs: new Map(Object.entries(payload.cachedOutputs)),
    invoke: async (node, inputs) => {
      const taskPayload = buildInvokePayload(node, inputs);
      const label = `${node.type} node "${
        (node.data as { label?: string }).label ?? node.id
      }"`;
      if (node.type === "crop-image") {
        const result = await withTimeout(
          executeCropImage(taskPayload as unknown as CropImagePayload),
          NODE_TIMEOUT_MS,
          label
        );
        return toNodeOutputs(node.type, result);
      }
      if (node.type === "gemini") {
        const result = await withTimeout(
          executeGemini(taskPayload as unknown as GeminiPayload),
          NODE_TIMEOUT_MS,
          label
        );
        return toNodeOutputs(node.type, result);
      }
      throw new Error(`Unsupported executable node: ${node.type}`);
    },
  });
}
