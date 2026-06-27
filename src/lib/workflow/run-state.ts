import type { NodeRuntimeStatus } from "@/store/workflow-store";

/** Minimal shape of a run needed to drive the canvas (subset of RunDto). */
export interface RunLike {
  id: string;
  status: "RUNNING" | "SUCCESS" | "FAILED" | "PARTIAL";
  nodeRuns: Array<{
    nodeId: string;
    nodeType: string;
    status: NodeRuntimeStatus;
    outputs: Record<string, string> | null;
  }>;
}

/** Canvas run-state derived from a server run (node glows + in-node outputs). */
export interface DerivedRunState {
  statuses: Record<string, NodeRuntimeStatus>;
  outputs: Record<string, Record<string, string>>;
  responseOutput: string | null;
}

/**
 * Project a server run onto the canvas store state. Used both by the live
 * poll and by the "re-attach to an in-progress run" path so a refresh /
 * back-navigation restores node statuses instead of only the history panel.
 */
export function deriveRunState(run: RunLike): DerivedRunState {
  const statuses: Record<string, NodeRuntimeStatus> = {};
  const outputs: Record<string, Record<string, string>> = {};
  for (const nr of run.nodeRuns) {
    statuses[nr.nodeId] = nr.status;
    if (nr.outputs) outputs[nr.nodeId] = nr.outputs;
  }
  const responseRun = run.nodeRuns.find((nr) => nr.nodeType === "response");
  const responseOutput = responseRun?.outputs?.output ?? null;
  return { statuses, outputs, responseOutput };
}
