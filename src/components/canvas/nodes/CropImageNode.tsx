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

export function CropImageNode({
  id,
  data,
  selected,
}: NodeProps & { data: CropImageData }) {
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);

  return (
    <NodeShell
      nodeId={id}
      title={data.label}
      icon={<Crop className="h-3.5 w-3.5" />}
      accent="#3b82f6"
      selected={selected}
      runnable
      deletable
      width={250}
      cost={0.001}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="image"
        className="handle-image"
        style={{ top: 52 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="image"
        className="handle-image"
        style={{ top: 52 }}
      />

      <p className="text-[10px] leading-6 text-zinc-500">Image *</p>

      <label className={fieldLabelClass}>Label</label>
      <input
        value={data.label}
        onChange={(e) => updateNodeData(id, { label: e.target.value })}
        className={`${inputClass} mb-2`}
      />

      <label className={fieldLabelClass}>Crop Region</label>
      <div className="grid grid-cols-2 gap-2">
        {CROP_FIELDS.map(({ key, label, min }) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="w-8 text-[10px] text-zinc-500">{label}</span>
            <input
              type="number"
              min={min}
              max={100}
              value={data[key]}
              onChange={(e) =>
                updateNodeData(id, { [key]: Number(e.target.value) })
              }
              className={inputClass}
            />
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-zinc-400">
        FFmpeg · Trigger.dev · 30s+ processing
      </p>

      <NodeOutput nodeId={id} outputKey="image" label="Cropped Image" />
    </NodeShell>
  );
}
