import { runs, task, tasks } from "@trigger.dev/sdk/v3";
import {
  buildInvokePayload,
  runWorkflowGraph,
  toNodeOutputs,
  type NodeOutputs,
} from "@/lib/execution/scheduler";
import { workflowGraphSchema } from "@/lib/workflow/types";

export interface WorkflowRunPayload {
  runId: string;
  graph: unknown;
  includeIds: string[];
  cachedOutputs: Record<string, NodeOutputs>;
}

const TERMINAL_OK = "COMPLETED";
const TERMINAL_FAIL = new Set([
  "FAILED",
  "CANCELED",
  "CRASHED",
  "TIMED_OUT",
  "INTERRUPTED",
  "SYSTEM_FAILURE",
  "EXPIRED",
]);

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Trigger a child task and poll its run to completion.
 *
 * We deliberately do NOT use `triggerAndWait` here: the scheduler invokes
 * independent nodes concurrently, and Trigger.dev forbids multiple
 * concurrent `triggerAndWait` calls (the "Parallel waits are not supported"
 * error). `trigger` + `runs.retrieve` polling has no such restriction, so
 * each node still runs as its own task run AND independent siblings execute
 * concurrently without blocking each other.
 */
async function triggerAndPoll(
  taskId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const handle = await tasks.trigger(taskId, payload);
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const run = await runs.retrieve(handle.id);
    if (run.status === TERMINAL_OK) {
      return (run.output ?? {}) as Record<string, unknown>;
    }
    if (TERMINAL_FAIL.has(run.status)) {
      const message =
        (run.error as { message?: string } | undefined)?.message ??
        run.status;
      throw new Error(`${taskId} run ${run.status}: ${message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`${taskId} run timed out`);
}

/**
 * Orchestrator task: schedules every executable node as its own
 * Trigger.dev task run, respecting graph dependencies. Independent nodes
 * are triggered concurrently and never block on unrelated siblings.
 */
export const workflowRunTask = task({
  id: "workflow-run",
  maxDuration: 1800,
  run: async (payload: WorkflowRunPayload) => {
    const graph = workflowGraphSchema.parse(payload.graph);

    const status = await runWorkflowGraph({
      runId: payload.runId,
      graph,
      includeIds: new Set(payload.includeIds),
      cachedOutputs: new Map(Object.entries(payload.cachedOutputs)),
      invoke: async (node, inputs) => {
        const taskPayload = buildInvokePayload(node, inputs);
        if (node.type === "crop-image" || node.type === "gemini") {
          const output = await triggerAndPoll(node.type, taskPayload);
          return toNodeOutputs(node.type, output);
        }
        throw new Error(`Unsupported executable node: ${node.type}`);
      },
    });

    return { status };
  },
});
