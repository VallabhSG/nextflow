import { describe, expect, test } from "vitest";
import {
  checkConnection,
  isAcyclic,
  upstreamClosure,
  wouldCreateCycle,
} from "@/lib/workflow/validation";
import { buildSampleGraph } from "@/lib/workflow/sample";
import { workflowGraphSchema } from "@/lib/workflow/types";
import type { SerializedNode } from "@/lib/workflow/types";

const nodes: SerializedNode[] = [
  {
    id: "inputs",
    type: "request-inputs",
    position: { x: 0, y: 0 },
    data: {
      kind: "request-inputs",
      label: "Request Inputs",
      fields: [
        { id: "t1", name: "Text", type: "text", value: "hello" },
        { id: "i1", name: "Image", type: "image", value: "" },
      ],
    },
  },
  {
    id: "crop",
    type: "crop-image",
    position: { x: 200, y: 0 },
    data: {
      kind: "crop-image",
      label: "Crop",
      cropX: 0,
      cropY: 0,
      cropWidth: 50,
      cropHeight: 50,
    },
  },
  {
    id: "llm",
    type: "gemini",
    position: { x: 400, y: 0 },
    data: { kind: "gemini", label: "Gemini", prompt: "p", systemPrompt: "" },
  },
  {
    id: "out",
    type: "response",
    position: { x: 600, y: 0 },
    data: { kind: "response", label: "Response" },
  },
];

describe("cycle detection", () => {
  test("detects a direct cycle", () => {
    // Arrange
    const edges = [{ source: "a", target: "b" }];

    // Act + Assert
    expect(wouldCreateCycle(edges, "b", "a")).toBe(true);
  });

  test("detects a transitive cycle", () => {
    const edges = [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
    ];
    expect(wouldCreateCycle(edges, "c", "a")).toBe(true);
  });

  test("allows a diamond (parallel-then-converge) shape", () => {
    const edges = [
      { source: "a", target: "b" },
      { source: "a", target: "c" },
      { source: "b", target: "d" },
    ];
    expect(wouldCreateCycle(edges, "c", "d")).toBe(false);
  });

  test("rejects self-loops", () => {
    expect(wouldCreateCycle([], "a", "a")).toBe(true);
  });

  test("isAcyclic accepts the sample workflow", () => {
    const graph = buildSampleGraph();
    expect(isAcyclic(graph.nodes, graph.edges)).toBe(true);
  });

  test("isAcyclic rejects a cyclic graph", () => {
    expect(
      isAcyclic(
        [{ id: "a" }, { id: "b" }],
        [
          { source: "a", target: "b" },
          { source: "b", target: "a" },
        ]
      )
    ).toBe(false);
  });
});

describe("type-safe connections", () => {
  test("accepts image output -> image input", () => {
    const result = checkConnection(nodes, [], {
      source: "inputs",
      sourceHandle: "field-i1",
      target: "crop",
      targetHandle: "image",
    });
    expect(result.valid).toBe(true);
  });

  test("rejects text output -> image input", () => {
    const result = checkConnection(nodes, [], {
      source: "inputs",
      sourceHandle: "field-t1",
      target: "crop",
      targetHandle: "image",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Type mismatch/);
  });

  test("accepts text output -> gemini prompt input", () => {
    const result = checkConnection(nodes, [], {
      source: "inputs",
      sourceHandle: "field-t1",
      target: "llm",
      targetHandle: "prompt",
    });
    expect(result.valid).toBe(true);
  });

  test("rejects a second edge into an occupied input", () => {
    const existing = [
      {
        id: "e1",
        source: "inputs",
        sourceHandle: "field-i1",
        target: "crop",
        targetHandle: "image",
      },
    ];
    const result = checkConnection(nodes, existing, {
      source: "inputs",
      sourceHandle: "field-i1",
      target: "crop",
      targetHandle: "image",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/already connected/);
  });

  test("rejects connections that would create a cycle", () => {
    const cropToLlm = [
      {
        id: "e1",
        source: "crop",
        sourceHandle: "image",
        target: "llm",
        targetHandle: "image",
      },
    ];
    // llm text -> crop has a type mismatch anyway, so build a gemini->gemini cycle.
    const twoLlms: SerializedNode[] = [
      ...nodes,
      {
        id: "llm2",
        type: "gemini",
        position: { x: 0, y: 0 },
        data: { kind: "gemini", label: "G2", prompt: "", systemPrompt: "" },
      },
    ];
    const edges = [
      ...cropToLlm,
      {
        id: "e2",
        source: "llm",
        sourceHandle: "text",
        target: "llm2",
        targetHandle: "prompt",
      },
    ];
    const result = checkConnection(twoLlms, edges, {
      source: "llm2",
      sourceHandle: "text",
      target: "llm",
      targetHandle: "prompt",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/cycle/);
  });

  test("rejects unknown handles and nodes", () => {
    expect(
      checkConnection(nodes, [], {
        source: "inputs",
        sourceHandle: "field-nope",
        target: "crop",
        targetHandle: "image",
      }).valid
    ).toBe(false);
    expect(
      checkConnection(nodes, [], {
        source: "ghost",
        sourceHandle: "x",
        target: "crop",
        targetHandle: "image",
      }).valid
    ).toBe(false);
  });
});

describe("upstream closure", () => {
  test("collects all transitive dependencies", () => {
    const edges = [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "x", target: "c" },
      { source: "q", target: "z" },
    ];
    const closure = upstreamClosure(edges, ["c"]);
    expect(closure).toEqual(new Set(["a", "b", "c", "x"]));
  });
});

describe("sample workflow", () => {
  test("parses against the graph schema and has 7 nodes", () => {
    const graph = buildSampleGraph();
    const parsed = workflowGraphSchema.safeParse(graph);
    expect(parsed.success).toBe(true);
    expect(graph.nodes).toHaveLength(7);
  });

  test("every edge endpoint and handle type is valid", () => {
    const graph = buildSampleGraph();
    for (const edge of graph.edges) {
      const others = graph.edges.filter((e) => e.id !== edge.id);
      const result = checkConnection(graph.nodes, others, edge);
      expect(result.valid, `${edge.id}: ${result.reason}`).toBe(true);
    }
  });
});
