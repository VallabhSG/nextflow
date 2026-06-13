"use client";

import { useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  FormInput,
  ImagePlus,
  Loader2,
  Plus,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
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
          className="nodrag h-14 w-full cursor-pointer rounded-md border border-zinc-200 object-cover"
          onClick={() => fileRef.current?.click()}
        />
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="nodrag flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 text-[11px] text-zinc-500 hover:border-[#6c5ce7] hover:text-[#6c5ce7]"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {uploading ? "Uploading…" : "Upload Image"}
        </button>
      )}
      {error && <p className="mt-1 text-[10px] text-red-500">{error}</p>}
    </div>
  );
}

export function RequestInputsNode({
  id,
  data,
  selected,
}: NodeProps & { data: RequestInputsData }) {
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const [addOpen, setAddOpen] = useState(false);

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
    setAddOpen(false);
    updateNodeData(id, {
      fields: [
        ...data.fields,
        {
          id: `f-${nanoid(6)}`,
          name: type === "text" ? "Text input" : "Image input",
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
      accent="#6c5ce7"
      selected={selected}
      width={260}
      headerExtra={
        <div className="relative">
          <button
            type="button"
            onClick={() => setAddOpen((v) => !v)}
            className="nodrag rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            aria-label="Add input field"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {addOpen && (
            <div className="nodrag absolute right-0 top-6 z-20 w-32 rounded-lg border border-zinc-200 bg-white py-1 shadow-xl">
              <button
                type="button"
                onClick={() => addField("text")}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] text-zinc-600 hover:bg-zinc-50"
              >
                <Type className="h-3 w-3" /> Text field
              </button>
              <button
                type="button"
                onClick={() => addField("image")}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] text-zinc-600 hover:bg-zinc-50"
              >
                <ImagePlus className="h-3 w-3" /> Image field
              </button>
            </div>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        {data.fields.length === 0 && (
          <p className="py-2 text-center text-[11px] text-zinc-400">
            Add a text or image field with “+”.
          </p>
        )}
        {data.fields.map((field) => (
          <div key={field.id} className="relative">
            <div className="mb-1 flex items-center gap-1.5">
              <input
                value={field.name}
                onChange={(e) => renameField(field.id, e.target.value)}
                className="nodrag flex-1 bg-transparent text-[11px] font-semibold text-zinc-700 outline-none focus:text-[#6c5ce7]"
              />
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-zinc-500">
                {field.type}
              </span>
              <button
                type="button"
                onClick={() => removeField(field.id)}
                className="nodrag text-zinc-300 hover:text-red-500"
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
      </div>
    </NodeShell>
  );
}
