import { prisma } from "@/lib/prisma";
import type {
  CropImageData,
  GeminiData,
  RequestInputsData,
  SerializedNode,
  WorkflowGraph,
} from "@/lib/workflow/types";

export type NodeOutputs = Record<string, string>;

/**
 * Invokes the heavy work for one executable node (Crop Image / Gemini).
 * Implementations: Trigger.dev tasks (production) or in-process (dev fallback).
 */
export type NodeInvoker = (
  node: SerializedNode,
  inputs: Record<string, string>
) => Promise<NodeOutputs>;

export interface RunWorkflowOptions {
  runId: string;
  graph: WorkflowGraph;
  /** Node ids selected for execution (already expanded by the caller). */
  includeIds: Set<string>;
  /** Last-known outputs for nodes NOT included in this run. */
  cachedOutputs: Map<string, NodeOutputs>;
  invoke: NodeInvoker;
}

export type FinalRunStatus = "SUCCESS" | "FAILED" | "PARTIAL";

interface NodeResult {
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  outputs: NodeOutputs;
}

async function updateNodeRun(
  runId: string,
  nodeId: string,
  data: {
    status: "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";
    inputs?: Record<string, string>;
    outputs?: NodeOutputs;
    error?: string;
    startedAt?: Date;
    finishedAt?: Date;
    durationMs?: number;
  }
) {
  await prisma.nodeRun.updateMany({
    where: { runId, nodeId },
    data,
  });
}

/**
 * Dependency-driven scheduler. Each node gets a memoized promise that
 * awaits only its direct upstream dependencies, so independent branches
 * run fully concurrently and never block on unrelated siblings.
 */
export async function runWorkflowGraph(
  options: RunWorkflowOptions
): Promise<FinalRunStatus> {
  const { runId, graph, includeIds, cachedOutputs, invoke } = options;
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));

  // target node -> incoming edges
  const incoming = new Map<string, typeof graph.edges>();
  for (const edge of graph.edges) {
    const list = incoming.get(edge.target) ?? [];
    list.push(edge);
    incoming.set(edge.target, list);
  }

  const memo = new Map<string, Promise<NodeResult>>();

  function resultFor(nodeId: string): Promise<NodeResult> {
    const existing = memo.get(nodeId);
    if (existing) return existing;
    const promise = computeNode(nodeId);
    memo.set(nodeId, promise);
    return promise;
  }

  async function resolveInputs(
    nodeId: string
  ): Promise<{ inputs: Record<string, string>; upstreamFailed: boolean }> {
    const edges = incoming.get(nodeId) ?? [];
    const inputs: Record<string, string> = {};
    let upstreamFailed = false;

    await Promise.all(
      edges.map(async (edge) => {
        const sourceId = edge.source;
        const sourceHandle = edge.sourceHandle ?? "";
        const targetHandle = edge.targetHandle ?? "";
        let outputs: NodeOutputs | undefined;

        const sourceNode = nodesById.get(sourceId);
        const isLocal =
          sourceNode?.type === "request-inputs" ||
          sourceNode?.type === "response";

        if (includeIds.has(sourceId) || isLocal) {
          const result = await resultFor(sourceId);
          if (result.status !== "SUCCESS") {
            upstreamFailed = true;
            return;
          }
          outputs = result.outputs;
        } else {
          outputs = cachedOutputs.get(sourceId);
          if (!outputs) {
            upstreamFailed = true;
            return;
          }
        }

        const value = outputs[sourceHandle];
        if (value !== undefined && value !== "") {
          inputs[targetHandle] = value;
        }
      })
    );

    return { inputs, upstreamFailed };
  }

  async function computeNode(nodeId: string): Promise<NodeResult> {
    const node = nodesById.get(nodeId);
    if (!node) return { status: "FAILED", outputs: {} };

    // Local-only nodes resolve instantly from their configuration.
    if (node.type === "request-inputs") {
      const data = node.data as RequestInputsData;
      const outputs: NodeOutputs = {};
      for (const field of data.fields) {
        outputs[`field-${field.id}`] = field.value;
      }
      if (includeIds.has(nodeId)) {
        const now = new Date();
        await updateNodeRun(runId, nodeId, {
          status: "SUCCESS",
          outputs,
          startedAt: now,
          finishedAt: now,
          durationMs: 0,
        });
      }
      return { status: "SUCCESS", outputs };
    }

    const startedAt = new Date();
    const { inputs, upstreamFailed } = await resolveInputs(nodeId);

    if (upstreamFailed) {
      await updateNodeRun(runId, nodeId, {
        status: "SKIPPED",
        error: "Skipped: upstream dependency failed or has no output",
        startedAt,
        finishedAt: new Date(),
      });
      return { status: "SKIPPED", outputs: {} };
    }

    if (node.type === "response") {
      const value = inputs["input"] ?? "";
      const outputs: NodeOutputs = { output: value };
      const finishedAt = new Date();
      await updateNodeRun(runId, nodeId, {
        status: "SUCCESS",
        inputs,
        outputs,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      });
      return { status: "SUCCESS", outputs };
    }

    // Executable node: Crop Image or Gemini.
    await updateNodeRun(runId, nodeId, {
      status: "RUNNING",
      inputs,
      startedAt,
    });

    try {
      const outputs = await invoke(node, inputs);
      const finishedAt = new Date();
      await updateNodeRun(runId, nodeId, {
        status: "SUCCESS",
        outputs,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      });
      return { status: "SUCCESS", outputs };
    } catch (error) {
      const finishedAt = new Date();
      await updateNodeRun(runId, nodeId, {
        status: "FAILED",
        error: error instanceof Error ? error.message : String(error),
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      });
      return { status: "FAILED", outputs: {} };
    }
  }

  const startedAt = new Date();
  const results = await Promise.all(
    [...includeIds].map((id) => resultFor(id).catch(
      (): NodeResult => ({ status: "FAILED", outputs: {} })
    ))
  );

  const finishedAt = new Date();
  const successes = results.filter((r) => r.status === "SUCCESS").length;
  const status: FinalRunStatus =
    successes === results.length
      ? "SUCCESS"
      : successes === 0
        ? "FAILED"
        : "PARTIAL";

  await prisma.workflowRun.update({
    where: { id: runId },
    data: {
      status,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    },
  });

  return status;
}

/** Build the payload for an executable node from its config + inputs. */
export function buildInvokePayload(
  node: SerializedNode,
  inputs: Record<string, string>
): Record<string, unknown> {
  if (node.type === "crop-image") {
    const data = node.data as CropImageData;
    return {
      imageUrl: inputs["image"] ?? "",
      cropX: data.cropX,
      cropY: data.cropY,
      cropWidth: data.cropWidth,
      cropHeight: data.cropHeight,
    };
  }
  if (node.type === "gemini") {
    const data = node.data as GeminiData;
    const promptParts = [data.prompt, inputs["prompt"]].filter(Boolean);
    return {
      prompt: promptParts.join("\n\n"),
      systemPrompt:
        [data.systemPrompt, inputs["system"]].filter(Boolean).join("\n\n") ||
        undefined,
      imageUrl: inputs["image"] || undefined,
      videoUrl: inputs["video"] || undefined,
      audioUrl: inputs["audio"] || undefined,
      fileUrl: inputs["file"] || undefined,
    };
  }
  throw new Error(`Node type ${node.type} is not executable`);
}
