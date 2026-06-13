"use client";

import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import type { PortDataType } from "@/lib/workflow/types";

/** Animated bezier edge, colored by the data type it carries. */
export function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const dataType = (data as { dataType?: PortDataType | null } | undefined)
    ?.dataType;

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      className={`nextflow-edge${dataType ? ` edge-${dataType}` : ""}`}
    />
  );
}
