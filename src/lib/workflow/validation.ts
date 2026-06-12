import type { SerializedEdge, SerializedNode } from "./types";
import { handleDataType } from "./types";

/**
 * Returns true if adding edge (source -> target) would create a cycle.
 * Performs a DFS from `target` looking for `source`.
 */
export function wouldCreateCycle(
  edges: Pick<SerializedEdge, "source" | "target">[],
  source: string,
  target: string
): boolean {
  if (source === target) return true;
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    const list = adjacency.get(e.source) ?? [];
    list.push(e.target);
    adjacency.set(e.source, list);
  }
  const stack = [target];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === source) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of adjacency.get(current) ?? []) stack.push(next);
  }
  return false;
}

/** Validate that the full graph is a DAG (no cycles anywhere). */
export function isAcyclic(
  nodes: Pick<SerializedNode, "id">[],
  edges: Pick<SerializedEdge, "source" | "target">[]
): boolean {
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const n of nodes) inDegree.set(n.id, 0);
  for (const e of edges) {
    const list = adjacency.get(e.source) ?? [];
    list.push(e.target);
    adjacency.set(e.source, list);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }
  const queue = [...inDegree.entries()]
    .filter(([, d]) => d === 0)
    .map(([id]) => id);
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited++;
    for (const next of adjacency.get(id) ?? []) {
      const d = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  return visited === nodes.length;
}

export interface ConnectionCheck {
  valid: boolean;
  reason?: string;
}

/**
 * Type-safe connection check: source handle data type must match the
 * target handle data type, and the connection must keep the graph acyclic.
 */
export function checkConnection(
  nodes: SerializedNode[],
  edges: SerializedEdge[],
  connection: {
    source: string;
    sourceHandle?: string | null;
    target: string;
    targetHandle?: string | null;
  }
): ConnectionCheck {
  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);
  if (!sourceNode || !targetNode) {
    return { valid: false, reason: "Unknown node" };
  }
  if (!connection.sourceHandle || !connection.targetHandle) {
    return { valid: false, reason: "Missing handle" };
  }

  const sourceType = handleDataType(
    sourceNode.type,
    sourceNode.data,
    connection.sourceHandle,
    "source"
  );
  const targetType = handleDataType(
    targetNode.type,
    targetNode.data,
    connection.targetHandle,
    "target"
  );
  if (!sourceType || !targetType) {
    return { valid: false, reason: "Unknown handle" };
  }
  if (sourceType !== targetType) {
    return {
      valid: false,
      reason: `Type mismatch: ${sourceType} → ${targetType}`,
    };
  }

  // One incoming edge per target handle.
  const occupied = edges.some(
    (e) =>
      e.target === connection.target &&
      e.targetHandle === connection.targetHandle
  );
  if (occupied) {
    return { valid: false, reason: "Input already connected" };
  }

  if (wouldCreateCycle(edges, connection.source, connection.target)) {
    return { valid: false, reason: "Connection would create a cycle" };
  }

  return { valid: true };
}

/** Upstream closure of a set of nodes (the nodes themselves included). */
export function upstreamClosure(
  edges: Pick<SerializedEdge, "source" | "target">[],
  nodeIds: string[]
): Set<string> {
  const parents = new Map<string, string[]>();
  for (const e of edges) {
    const list = parents.get(e.target) ?? [];
    list.push(e.source);
    parents.set(e.target, list);
  }
  const result = new Set<string>();
  const stack = [...nodeIds];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    for (const p of parents.get(id) ?? []) stack.push(p);
  }
  return result;
}
