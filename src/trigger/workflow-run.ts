import { task } from "@trigger.dev/sdk/v3";
import {
  buildInvokePayload,
  runWorkflowGraph,
  type NodeOutputs,
} from "@/lib/execution/scheduler";
import type { CropImagePayload, GeminiPayload } from "@/lib/execution/executors";
import { workflowGraphSchema } from "@/lib/workflow/types";
import { cropImageTask, geminiTask } from "./nodes";

export interface WorkflowRunPayload {
  runId: string;
  graph: unknown;
  includeIds: string[];
  cachedOutputs: Record<string, NodeOutputs>;
}

/**
 * Orchestrator task: schedules every executable node as its own
 * Trigger.dev task run, respecting graph dependencies. Independent
 * nodes are triggered concurrently.
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
        if (node.type === "crop-image") {
          const result = await cropImageTask.triggerAndWait(
            taskPayload as unknown as CropImagePayload
          );
          if (!result.ok) throw new Error(String(result.error));
          return result.output as NodeOutputs;
        }
        if (node.type === "gemini") {
          const result = await geminiTask.triggerAndWait(
            taskPayload as unknown as GeminiPayload
          );
          if (!result.ok) throw new Error(String(result.error));
          return result.output as NodeOutputs;
        }
        throw new Error(`Unsupported executable node: ${node.type}`);
      },
    });

    return { status };
  },
});
