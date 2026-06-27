"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Crop } from "lucide-react";
import type { CropImageData } from "@/lib/workflow/types";
import { useWorkflowStore } from "@/store/workflow-store";
import { NodeOutput, NodeShell, fieldLabelClass, inputClass } from "./NodeShell";

const CROP_FIELDS: Array<{
  key: "cropX" | "cropY" | "cropWidth" | "cropHeight";
  label: string;
  min: number;
}> = [
  { key: "cropX", label: "X %", min: 0 },
  { key: "cropY", label: "Y %", min: 0 },
  { key: "cropWidth", label: "W %", min: 1 },
  { key: "cropHeight", label: "H %", min: 1 },
];

// Ports are laid out as a single contiguous stack of fixed-height rows so the
// absolutely-positioned handles line up with their rows (same approach as
// GeminiNode). Row 0 is the image; rows 1-4 are the crop dimensions. Nothing
// may sit between these rows or the handle offsets would drift.
const PORTS_TOP = 52;
const PORT_SPACING = 30;

export function CropImageNode({
  id,
  data,
  selected,
}: NodeProps & { data: CropImageData }) {
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const edges = useWorkflowStore((s) => s.edges);

  // Connected input handles grey out their manual entry fields.
  const connected = new Set(
    edges.filter((e) => e.target === id).map((e) => e.targetHandle)
  );

  return (
    <NodeShell
      nodeId={id}
      title={data.label}
      icon={<Crop className="h-3.5 w-3.5" />}
      accent="#3b82f6"
      selected={selected}
      runnable
      deletable
      width={260}
      cost={0.001}
    >
      {/* Image input (row 0) + cropped-image output on the right. */}
      <Handle
        type="target"
        position={Position.Left}
        id="image"
        className="handle-image"
        style={{ top: PORTS_TOP }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="image"
        className="handle-image"
        style={{ top: PORTS_TOP }}
      />
      {/* One connectable input handle per crop dimension (rows 1-4). */}
      {CROP_FIELDS.map((field, i) => (
        <Handle
          key={field.key}
          type="target"
          position={Position.Left}
          id={field.key}
          className="handle-text"
          style={{ top: PORTS_TOP + (i + 1) * PORT_SPACING }}
        />
      ))}

      {/* Contiguous port rows — keep aligned with the handle offsets above. */}
      <div>
        <div
          className="flex items-center text-[10px] text-zinc-500"
          style={{ height: PORT_SPACING }}
        >
          Image *
          {connected.has("image") && (
            <span className="ml-1 font-medium text-[#3b82f6]">· connected</span>
          )}
        </div>
        {CROP_FIELDS.map(({ key, label, min }) => {
          const isConnected = connected.has(key);
          return (
            <div
              key={key}
              className="flex items-center gap-2"
              style={{ height: PORT_SPACING }}
            >
              <span
                className={`w-9 shrink-0 text-[10px] ${
                  isConnected ? "font-medium text-[#3b82f6]" : "text-zinc-500"
                }`}
              >
                {label}
              </span>
              <input
                type="number"
                min={min}
                max={100}
                value={data[key]}
                disabled={isConnected}
                placeholder={isConnected ? "connected" : undefined}
                onChange={(e) =>
                  updateNodeData(id, { [key]: Number(e.target.value) })
                }
                className={`${inputClass} flex-1 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400`}
              />
            </div>
          );
        })}
      </div>

      <label className={`${fieldLabelClass} mt-2`}>Label</label>
      <input
        value={data.label}
        onChange={(e) => updateNodeData(id, { label: e.target.value })}
        className={inputClass}
      />

      <p className="mt-1.5 text-[10px] text-zinc-400">
        FFmpeg · Trigger.dev · 30s+ processing
      </p>

      <NodeOutput nodeId={id} outputKey="image" label="Cropped Image" />
    </NodeShell>
  );
}
