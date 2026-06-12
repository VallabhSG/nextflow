"use client";

import { useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FormInput, ImagePlus, Plus, Trash2, Upload, Loader2 } from "lucide-react";
import { nanoid } from "nanoid";
import type { RequestInputsData } from "@/lib/workflow/types";
import { useWorkflowStore } from "@/store/workflow-store";
import { uploadImage } from "@/lib/upload";
import { NodeShell, inputClass } from "./NodeShell";

function ImageField({
  nodeId,
  fieldId,
  value,
}: {
  nodeId: string;
  fieldId: string;
  value: string;
}) {
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const nodes = useWorkflowStore((s) => s.nodes);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadImage(file);
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const data = node.data as RequestInputsData;
      updateNodeData(nodeId, {
        fields: data.fields.map((f) =>
          f.id === fieldId ? { ...f, value: url } : f
        ),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt="Uploaded"
          className="nodrag h-12 w-full cursor-pointer rounded-md border border-zinc-700 object-cover"
          onClick={() => fileRef.current?.click()}
        />
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="nodrag flex h-12 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-zinc-700 text-[11px] text-zinc-500 hover:border-violet-500 hover:text-violet-400"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {uploading ? "Uploading…" : "Upload image"}
        </button>
      )}
      {error && <p className="mt-1 text-[10px] text-red-400">{error}</p>}
    </div>
  );
}

export function RequestInputsNode({
  id,
  data,
  selected,
}: NodeProps & { data: RequestInputsData }) {
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);

  function setField(fieldId: string, value: string) {
    updateNodeData(id, {
      fields: data.fields.map((f) =>
        f.id === fieldId ? { ...f, value } : f
      ),
    });
  }

  function renameField(fieldId: string, name: string) {
    updateNodeData(id, {
      fields: data.fields.map((f) =>
        f.id === fieldId ? { ...f, name } : f
      ),
    });
  }

  function addField(type: "text" | "image") {
    updateNodeData(id, {
      fields: [
        ...data.fields,
        {
          id: `f-${nanoid(6)}`,
          name: type === "text" ? "Text Input" : "Image Input",
          type,
          value: "",
        },
      ],
    });
  }

  function removeField(fieldId: string) {
    updateNodeData(id, {
      fields: data.fields.filter((f) => f.id !== fieldId),
    });
  }

  return (
    <NodeShell
      nodeId={id}
      title={data.label}
      icon={<FormInput className="h-3.5 w-3.5" />}
      accent="#8b5cf6"
      selected={selected}
      width={300}
    >
      <div className="space-y-3">
        {data.fields.map((field) => (
          <div key={field.id} className="relative" style={{ minHeight: 68 }}>
            <div className="mb-1 flex items-center gap-1.5">
              <input
                value={field.name}
                onChange={(e) => renameField(field.id, e.target.value)}
                className="nodrag flex-1 bg-transparent text-[11px] font-semibold text-zinc-300 outline-none focus:text-violet-300"
              />
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-zinc-500">
                {field.type}
              </span>
              <button
                type="button"
                onClick={() => removeField(field.id)}
                className="nodrag text-zinc-600 hover:text-red-400"
                aria-label={`Remove ${field.name}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            {field.type === "text" ? (
              <textarea
                value={field.value}
                onChange={(e) => setField(field.id, e.target.value)}
                rows={2}
                placeholder="Enter text…"
                className={`${inputClass} resize-none`}
              />
            ) : (
              <ImageField nodeId={id} fieldId={field.id} value={field.value} />
            )}
            <Handle
              type="source"
              position={Position.Right}
              id={`field-${field.id}`}
              className={
                field.type === "image" ? "handle-image" : "handle-text"
              }
              style={{ top: "55%", right: -17, position: "absolute" }}
            />
          </div>
        ))}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => addField("text")}
            className="nodrag flex flex-1 items-center justify-center gap-1 rounded-md border border-zinc-700 py-1 text-[11px] text-zinc-400 hover:border-violet-500 hover:text-violet-300"
          >
            <Plus className="h-3 w-3" /> Text
          </button>
          <button
            type="button"
            onClick={() => addField("image")}
            className="nodrag flex flex-1 items-center justify-center gap-1 rounded-md border border-zinc-700 py-1 text-[11px] text-zinc-400 hover:border-violet-500 hover:text-violet-300"
          >
            <ImagePlus className="h-3 w-3" /> Image
          </button>
        </div>
      </div>
    </NodeShell>
  );
}
