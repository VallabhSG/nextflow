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
    // Per-handle value lists, in edge order, so multi-connection handles
    // (e.g. Gemini Image (Vision)) receive every connected value.
    const collected = new Map<string, (string | undefined)[]>();
    let upstreamFailed = false;

    await Promise.all(
      edges.map(async (edge, index) => {
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
          const list = collected.get(targetHandle) ?? [];
          list[index] = value;
          collected.set(targetHandle, list);
        }
      })
    );

    // Flatten: first value keeps the handle id, extras get `handle#2`, ...
    const inputs: Record<string, string> = {};
    for (const [handle, values] of collected) {
      const ordered = values.filter((v): v is string => v !== undefined);
      ordered.forEach((value, i) => {
        inputs[i === 0 ? handle : `${handle}#${i + 1}`] = value;
      });
    }

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

/**
 * Map raw executor results onto the node's output handle ids
 * (e.g. crop's `{ imageUrl }` -> the `image` source handle).
 */
export function toNodeOutputs(
  nodeType: string,
  result: Record<string, unknown>
): NodeOutputs {
  if (nodeType === "crop-image") {
    return { image: String(result.imageUrl ?? "") };
  }
  if (nodeType === "gemini") {
    return { text: String(result.text ?? "") };
  }
  throw new Error(`Node type ${nodeType} is not executable`);
}

/** Build the payload for an executable node from its config + inputs. */
export function buildInvokePayload(
  node: SerializedNode,
  inputs: Record<string, string>
): Record<string, unknown> {
  if (node.type === "crop-image") {
    const data = node.data as CropImageData;
    // A connected dimension handle overrides the manual field. Unconnected,
    // empty, or non-numeric inputs fall back to the node's configured value.
    const dim = (handle: string, fallback: number): number => {
      const raw = inputs[handle];
      if (raw === undefined || raw.trim() === "") return fallback;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    return {
      imageUrl: inputs["image"] ?? "",
      cropX: dim("cropX", data.cropX),
      cropY: dim("cropY", data.cropY),
      cropWidth: dim("cropWidth", data.cropWidth),
      cropHeight: dim("cropHeight", data.cropHeight),
    };
  }
  if (node.type === "gemini") {
    const data = node.data as GeminiData;
    // Connected inputs take precedence over manual entry (the UI greys
    // out manual fields once a handle is connected).
    const imageUrls = Object.keys(inputs)
      .filter((k) => k === "image" || k.startsWith("image#"))
      .sort()
      .map((k) => inputs[k]);
    return {
      prompt: inputs["prompt"] ?? data.prompt,
      systemPrompt: inputs["system"] ?? (data.systemPrompt || undefined),
      model: data.model,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      videoUrl: inputs["video"] || undefined,
      audioUrl: inputs["audio"] || undefined,
      fileUrl: inputs["file"] || undefined,
    };
  }
  throw new Error(`Node type ${node.type} is not executable`);
}
