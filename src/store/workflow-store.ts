"use client";

import { create } from "zustand";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { nanoid } from "nanoid";
import type {
  NodeKind,
  PortDataType,
  SerializedEdge,
  SerializedNode,
  WorkflowGraph,
  WorkflowNodeData,
} from "@/lib/workflow/types";
import { handleDataType, NODE_SPECS } from "@/lib/workflow/types";
import { checkConnection } from "@/lib/workflow/validation";

export type FlowNode = Node<WorkflowNodeData>;
export type FlowEdge = Edge;

export type NodeRuntimeStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "SKIPPED";

interface Snapshot {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

const MAX_HISTORY = 100;

interface WorkflowStore {
  workflowId: string | null;
  workflowName: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  past: Snapshot[];
  future: Snapshot[];
  dirty: boolean;
  /** nodeId -> live status of the current run (drives the pulsating glow). */
  nodeStatuses: Record<string, NodeRuntimeStatus>;
  activeRunId: string | null;
  connectionError: string | null;
  /** Latest Response node output (from the most recent run). */
  responseOutput: string | null;
  /** Latest outputs per node from the most recent run (for in-node display). */
  nodeOutputs: Record<string, Record<string, string>>;
  /** Registered by the canvas so node components can trigger runs. */
  runHandler: ((nodeIds?: string[]) => void) | null;

  load: (id: string, name: string, graph: WorkflowGraph) => void;
  setWorkflowName: (name: string) => void;
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  isValidConnection: (connection: Connection | FlowEdge) => boolean;
  addNode: (kind: NodeKind, position: { x: number; y: number }) => void;
  updateNodeData: (id: string, data: Partial<WorkflowNodeData>) => void;
  deleteNodes: (ids: string[]) => void;
  deleteEdges: (ids: string[]) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
  setNodeStatuses: (statuses: Record<string, NodeRuntimeStatus>) => void;
  setActiveRunId: (runId: string | null) => void;
  setConnectionError: (error: string | null) => void;
  setResponseOutput: (output: string | null) => void;
  setNodeOutputs: (outputs: Record<string, Record<string, string>>) => void;
  setRunHandler: (handler: ((nodeIds?: string[]) => void) | null) => void;
  toGraph: () => WorkflowGraph;
}

function toEdgeStyle(edge: FlowEdge, dataType?: PortDataType | null): FlowEdge {
  return {
    ...edge,
    type: "animated",
    animated: false,
    data: { ...edge.data, dataType: dataType ?? null },
  };
}

function edgeDataType(
  nodes: Pick<FlowNode, "id" | "type" | "data">[],
  source: string,
  sourceHandle: string | null | undefined
): PortDataType | null {
  const node = nodes.find((n) => n.id === source);
  if (!node || !sourceHandle) return null;
  return handleDataType(
    node.type as NodeKind,
    node.data as WorkflowNodeData,
    sourceHandle,
    "source"
  );
}

function serializeNodes(nodes: FlowNode[]): SerializedNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: (n.type ?? "request-inputs") as NodeKind,
    position: { x: n.position.x, y: n.position.y },
    data: n.data as SerializedNode["data"],
  }));
}

function serializeEdges(edges: FlowEdge[]): SerializedEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle ?? null,
    target: e.target,
    targetHandle: e.targetHandle ?? null,
  }));
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  workflowId: null,
  workflowName: "",
  nodes: [],
  edges: [],
  past: [],
  future: [],
  dirty: false,
  nodeStatuses: {},
  activeRunId: null,
  connectionError: null,
  responseOutput: null,
  nodeOutputs: {},
  runHandler: null,

  load: (id, name, graph) =>
    set({
      workflowId: id,
      workflowName: name,
      nodes: graph.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data,
        deletable: NODE_SPECS[n.type].deletable,
      })),
      edges: graph.edges.map((e) =>
        toEdgeStyle(
          {
            id: e.id,
            source: e.source,
            sourceHandle: e.sourceHandle ?? undefined,
            target: e.target,
            targetHandle: e.targetHandle ?? undefined,
          },
          edgeDataType(
            graph.nodes.map((n) => ({ id: n.id, type: n.type, data: n.data })),
            e.source,
            e.sourceHandle
          )
        )
      ),
      past: [],
      future: [],
      dirty: false,
      nodeStatuses: {},
      activeRunId: null,
    }),

  setWorkflowName: (name) => set({ workflowName: name, dirty: true }),

  onNodesChange: (changes) => {
    // Block removal of non-deletable nodes at the change level too
    // (covers Backspace via React Flow).
    const filtered = changes.filter((change) => {
      if (change.type !== "remove") return true;
      const node = get().nodes.find((n) => n.id === change.id);
      return node ? NODE_SPECS[node.type as NodeKind].deletable : true;
    });
    const removals = filtered.some((c) => c.type === "remove");
    if (removals) get().pushHistory();
    set({
      nodes: applyNodeChanges(filtered, get().nodes),
      dirty: true,
    });
  },

  onEdgesChange: (changes) => {
    const removals = changes.some((c) => c.type === "remove");
    if (removals) get().pushHistory();
    set({
      edges: applyEdgeChanges(changes, get().edges),
      dirty: true,
    });
  },

  isValidConnection: (connection) => {
    const { nodes, edges } = get();
    const result = checkConnection(
      serializeNodes(nodes),
      serializeEdges(edges),
      {
        source: connection.source ?? "",
        sourceHandle: connection.sourceHandle,
        target: connection.target ?? "",
        targetHandle: connection.targetHandle,
      }
    );
    return result.valid;
  },

  onConnect: (connection) => {
    const { nodes, edges } = get();
    const result = checkConnection(
      serializeNodes(nodes),
      serializeEdges(edges),
      {
        source: connection.source,
        sourceHandle: connection.sourceHandle,
        target: connection.target,
        targetHandle: connection.targetHandle,
      }
    );
    if (!result.valid) {
      set({ connectionError: result.reason ?? "Invalid connection" });
      return;
    }
    get().pushHistory();
    const edge: FlowEdge = toEdgeStyle(
      {
        id: `edge-${nanoid(8)}`,
        source: connection.source,
        sourceHandle: connection.sourceHandle ?? undefined,
        target: connection.target,
        targetHandle: connection.targetHandle ?? undefined,
      },
      edgeDataType(nodes, connection.source, connection.sourceHandle)
    );
    set({
      edges: [...edges, edge],
      dirty: true,
      connectionError: null,
    });
  },

  addNode: (kind, position) => {
    const spec = NODE_SPECS[kind];
    if (!spec.deletable) return; // pre-placed nodes can't be added again
    get().pushHistory();
    const id = `${kind}-${nanoid(8)}`;
    const data: WorkflowNodeData =
      kind === "crop-image"
        ? {
            kind: "crop-image",
            label: spec.title,
            cropX: 0,
            cropY: 0,
            cropWidth: 100,
            cropHeight: 100,
          }
        : {
            kind: "gemini",
            label: spec.title,
            prompt: "",
            systemPrompt: "",
          };
    const node: FlowNode = {
      id,
      type: kind,
      position,
      data,
      deletable: true,
    };
    set({ nodes: [...get().nodes, node], dirty: true });
  },

  updateNodeData: (id, data) =>
    set({
      nodes: get().nodes.map((n) =>
        n.id === id
          ? ({ ...n, data: { ...n.data, ...data } } as FlowNode)
          : n
      ),
      dirty: true,
    }),

  deleteNodes: (ids) => {
    const deletable = ids.filter((id) => {
      const node = get().nodes.find((n) => n.id === id);
      return node ? NODE_SPECS[node.type as NodeKind].deletable : false;
    });
    if (deletable.length === 0) return;
    get().pushHistory();
    const remaining = new Set(deletable);
    set({
      nodes: get().nodes.filter((n) => !remaining.has(n.id)),
      edges: get().edges.filter(
        (e) => !remaining.has(e.source) && !remaining.has(e.target)
      ),
      dirty: true,
    });
  },

  deleteEdges: (ids) => {
    if (ids.length === 0) return;
    get().pushHistory();
    const remove = new Set(ids);
    set({
      edges: get().edges.filter((e) => !remove.has(e.id)),
      dirty: true,
    });
  },

  pushHistory: () => {
    const { nodes, edges, past } = get();
    const snapshot: Snapshot = {
      nodes: nodes.map((n) => ({ ...n, data: { ...n.data } })),
      edges: edges.map((e) => ({ ...e })),
    };
    set({
      past: [...past.slice(-MAX_HISTORY + 1), snapshot],
      future: [],
    });
  },

  undo: () => {
    const { past, future, nodes, edges } = get();
    const previous = past[past.length - 1];
    if (!previous) return;
    set({
      past: past.slice(0, -1),
      future: [...future, { nodes, edges }],
      nodes: previous.nodes,
      edges: previous.edges,
      dirty: true,
    });
  },

  redo: () => {
    const { past, future, nodes, edges } = get();
    const next = future[future.length - 1];
    if (!next) return;
    set({
      future: future.slice(0, -1),
      past: [...past, { nodes, edges }],
      nodes: next.nodes,
      edges: next.edges,
      dirty: true,
    });
  },

  markSaved: () => set({ dirty: false }),

  setNodeStatuses: (statuses) => set({ nodeStatuses: statuses }),
  setActiveRunId: (runId) => set({ activeRunId: runId }),
  setConnectionError: (error) => set({ connectionError: error }),
  setResponseOutput: (output) => set({ responseOutput: output }),
  setNodeOutputs: (outputs) => set({ nodeOutputs: outputs }),
  setRunHandler: (handler) => set({ runHandler: handler }),

  toGraph: () => ({
    nodes: serializeNodes(get().nodes),
    edges: serializeEdges(get().edges),
  }),
}));
