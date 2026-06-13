import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    nodeRun: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    workflowRun: { update: vi.fn().mockResolvedValue({}) },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  buildInvokePayload,
  runWorkflowGraph,
  type NodeOutputs,
} from "@/lib/execution/scheduler";
import { buildSampleGraph } from "@/lib/workflow/sample";
import type { SerializedNode, WorkflowGraph } from "@/lib/workflow/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function simpleGraph(): WorkflowGraph {
  return {
    nodes: [
      {
        id: "in",
        type: "request-inputs",
        position: { x: 0, y: 0 },
        data: {
          kind: "request-inputs",
          label: "Inputs",
          fields: [
            { id: "t", name: "Text", type: "text", value: "hello world" },
          ],
        },
      },
      {
        id: "g1",
        type: "gemini",
        position: { x: 0, y: 0 },
        data: { kind: "gemini", label: "G1", prompt: "do x", systemPrompt: "" },
      },
      {
        id: "g2",
        type: "gemini",
        position: { x: 0, y: 0 },
        data: { kind: "gemini", label: "G2", prompt: "do y", systemPrompt: "" },
      },
      {
        id: "out",
        type: "response",
        position: { x: 0, y: 0 },
        data: { kind: "response", label: "Response" },
      },
    ],
    edges: [
      {
        id: "e1",
        source: "in",
        sourceHandle: "field-t",
        target: "g1",
        targetHandle: "prompt",
      },
      {
        id: "e2",
        source: "g1",
        sourceHandle: "text",
        target: "g2",
        targetHandle: "prompt",
      },
      {
        id: "e3",
        source: "g2",
        sourceHandle: "text",
        target: "out",
        targetHandle: "input",
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runWorkflowGraph", () => {
  test("executes a sequential chain and feeds outputs downstream", async () => {
    const graph = simpleGraph();
    const received: Record<string, Record<string, string>> = {};

    const status = await runWorkflowGraph({
      runId: "run-1",
      graph,
      includeIds: new Set(graph.nodes.map((n) => n.id)),
      cachedOutputs: new Map(),
      invoke: async (node, inputs) => {
        received[node.id] = inputs;
        return { text: `${node.id}-output` } satisfies NodeOutputs;
      },
    });

    expect(status).toBe("SUCCESS");
    // g1 received the request-inputs field value.
    expect(received["g1"]).toEqual({ prompt: "hello world" });
    // g2 received g1's output.
    expect(received["g2"]).toEqual({ prompt: "g1-output" });
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data: expect.objectContaining({ status: "SUCCESS" }),
      })
    );
  });

  test("independent siblings run concurrently", async () => {
    // Two gemini nodes both fed by request-inputs only.
    const graph: WorkflowGraph = {
      nodes: simpleGraph().nodes,
      edges: [
        {
          id: "e1",
          source: "in",
          sourceHandle: "field-t",
          target: "g1",
          targetHandle: "prompt",
        },
        {
          id: "e2",
          source: "in",
          sourceHandle: "field-t",
          target: "g2",
          targetHandle: "prompt",
        },
      ],
    };

    let inFlight = 0;
    let maxInFlight = 0;

    const status = await runWorkflowGraph({
      runId: "run-2",
      graph,
      includeIds: new Set(["in", "g1", "g2"]),
      cachedOutputs: new Map(),
      invoke: async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await sleep(50);
        inFlight--;
        return { text: "ok" };
      },
    });

    expect(status).toBe("SUCCESS");
    expect(maxInFlight).toBe(2); // both ran at the same time
  });

  test("a failed node marks downstream as skipped and run as partial", async () => {
    const graph = simpleGraph();

    const status = await runWorkflowGraph({
      runId: "run-3",
      graph,
      includeIds: new Set(graph.nodes.map((n) => n.id)),
      cachedOutputs: new Map(),
      invoke: async (node) => {
        if (node.id === "g1") throw new Error("boom");
        return { text: "ok" };
      },
    });

    expect(status).toBe("PARTIAL"); // request-inputs succeeded, rest failed/skipped

    const calls = vi.mocked(prisma.nodeRun.updateMany).mock.calls;
    const statusFor = (nodeId: string) =>
      calls
        .filter((c) => c[0].where.nodeId === nodeId)
        .map((c) => c[0].data.status)
        .at(-1);
    expect(statusFor("g1")).toBe("FAILED");
    expect(statusFor("g2")).toBe("SKIPPED");
    expect(statusFor("out")).toBe("SKIPPED");
  });

  test("selective run uses cached outputs for excluded upstream nodes", async () => {
    const graph = simpleGraph();
    const received: Record<string, Record<string, string>> = {};

    const status = await runWorkflowGraph({
      runId: "run-4",
      graph,
      includeIds: new Set(["g2"]),
      cachedOutputs: new Map([["g1", { text: "cached-g1" }]]),
      invoke: async (node, inputs) => {
        received[node.id] = inputs;
        return { text: "fresh" };
      },
    });

    expect(status).toBe("SUCCESS");
    expect(received["g2"]).toEqual({ prompt: "cached-g1" });
  });

  test("selective run skips when excluded upstream has no cached output", async () => {
    const graph = simpleGraph();

    const status = await runWorkflowGraph({
      runId: "run-5",
      graph,
      includeIds: new Set(["g2"]),
      cachedOutputs: new Map(),
      invoke: async () => ({ text: "x" }),
    });

    expect(status).toBe("FAILED");
  });

  test("sample workflow executes with correct fan-out and convergence", async () => {
    const graph = buildSampleGraph();
    const executed: string[] = [];
    const received: Record<string, Record<string, string>> = {};

    const status = await runWorkflowGraph({
      runId: "run-6",
      graph,
      includeIds: new Set(graph.nodes.map((n) => n.id)),
      cachedOutputs: new Map(),
      invoke: async (node, inputs) => {
        executed.push(node.id);
        received[node.id] = inputs;
        if (node.type === "crop-image")
          return { image: `cropped-by-${node.id}` };
        return { text: `${node.id}-says` };
      },
    });

    expect(status).toBe("SUCCESS");
    // All 5 executable nodes ran exactly once.
    expect([...executed].sort()).toEqual([
      "crop-1",
      "crop-2",
      "gemini-1",
      "gemini-2",
      "gemini-final",
    ]);
    // Sequential Gemini chain order respected.
    expect(executed.indexOf("gemini-1")).toBeLessThan(
      executed.indexOf("gemini-2")
    );
    expect(executed.indexOf("gemini-2")).toBeLessThan(
      executed.indexOf("gemini-final")
    );
    // Both crops converge on Final Gemini's multi-connection Vision input.
    const finalInputs = received["gemini-final"];
    const images = Object.keys(finalInputs)
      .filter((k) => k === "image" || k.startsWith("image#"))
      .map((k) => finalInputs[k])
      .sort();
    expect(images).toEqual(["cropped-by-crop-1", "cropped-by-crop-2"]);
  });
});

describe("buildInvokePayload", () => {
  const cropNode: SerializedNode = {
    id: "c",
    type: "crop-image",
    position: { x: 0, y: 0 },
    data: {
      kind: "crop-image",
      label: "Crop",
      cropX: 10,
      cropY: 20,
      cropWidth: 30,
      cropHeight: 40,
    },
  };

  const geminiNode: SerializedNode = {
    id: "g",
    type: "gemini",
    position: { x: 0, y: 0 },
    data: {
      kind: "gemini",
      label: "G",
      prompt: "node prompt",
      systemPrompt: "node system",
    },
  };

  test("crop payload carries crop params and input image", () => {
    expect(buildInvokePayload(cropNode, { image: "http://img" })).toEqual({
      imageUrl: "http://img",
      cropX: 10,
      cropY: 20,
      cropWidth: 30,
      cropHeight: 40,
    });
  });

  test("connected prompt input takes precedence over manual entry", () => {
    const payload = buildInvokePayload(geminiNode, {
      prompt: "upstream text",
      image: "http://img",
    });
    expect(payload.prompt).toBe("upstream text");
    expect(payload.systemPrompt).toBe("node system");
    expect(payload.imageUrls).toEqual(["http://img"]);
    expect(payload.videoUrl).toBeUndefined();
  });

  test("manual prompt is used when nothing is connected", () => {
    const payload = buildInvokePayload(geminiNode, {});
    expect(payload.prompt).toBe("node prompt");
    expect(payload.imageUrls).toBeUndefined();
  });

  test("multiple vision connections become an ordered imageUrls array", () => {
    const payload = buildInvokePayload(geminiNode, {
      prompt: "p",
      image: "http://first",
      "image#2": "http://second",
    });
    expect(payload.imageUrls).toEqual(["http://first", "http://second"]);
  });

  test("throws for non-executable nodes", () => {
    const responseNode: SerializedNode = {
      id: "r",
      type: "response",
      position: { x: 0, y: 0 },
      data: { kind: "response", label: "Response" },
    };
    expect(() => buildInvokePayload(responseNode, {})).toThrow(
      /not executable/
    );
  });
});
