import { z } from "zod";

/** Data types that can flow across an edge. */
export type PortDataType = "text" | "image" | "video" | "audio" | "file";

export const PORT_DATA_TYPES: PortDataType[] = [
  "text",
  "image",
  "video",
  "audio",
  "file",
];

export type NodeKind = "request-inputs" | "crop-image" | "gemini" | "response";

/** A single configurable field on the Request-Inputs node. */
export interface RequestInputField {
  id: string;
  name: string;
  type: "text" | "image";
  /** Text value or uploaded image URL (Transloadit / data URL). */
  value: string;
}

export interface RequestInputsData {
  kind: "request-inputs";
  label: string;
  fields: RequestInputField[];
  [key: string]: unknown;
}

export interface CropImageData {
  kind: "crop-image";
  label: string;
  /** Crop region as percentages of the source image (0-100). */
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  [key: string]: unknown;
}

export interface GeminiData {
  kind: "gemini";
  label: string;
  prompt: string;
  systemPrompt: string;
  /** Model id; defaults to gemini-3.1-pro. */
  model?: string;
  [key: string]: unknown;
}

export const GEMINI_MODELS = [
  "gemini-3.1-pro-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
] as const;

export interface ResponseData {
  kind: "response";
  label: string;
  [key: string]: unknown;
}

export type WorkflowNodeData =
  | RequestInputsData
  | CropImageData
  | GeminiData
  | ResponseData;

/** Static description of one input/output port of a node type. */
export interface PortSpec {
  id: string;
  label: string;
  dataType: PortDataType;
  required?: boolean;
  /** Allows multiple simultaneous incoming connections. */
  multi?: boolean;
}

export interface NodeSpec {
  kind: NodeKind;
  title: string;
  category: "Image" | "Video" | "Audio" | "Others";
  deletable: boolean;
  /** Runs remotely (Trigger.dev) vs. local-only. */
  executable: boolean;
  inputs: PortSpec[];
  outputs: PortSpec[];
}

export const NODE_SPECS: Record<NodeKind, NodeSpec> = {
  "request-inputs": {
    kind: "request-inputs",
    title: "Request Inputs",
    category: "Others",
    deletable: false,
    executable: false,
    inputs: [],
    // Outputs are dynamic — one handle per configured field.
    outputs: [],
  },
  "crop-image": {
    kind: "crop-image",
    title: "Crop Image",
    category: "Image",
    deletable: true,
    executable: true,
    inputs: [{ id: "image", label: "Image", dataType: "image", required: true }],
    outputs: [{ id: "image", label: "Cropped Image", dataType: "image" }],
  },
  gemini: {
    kind: "gemini",
    title: "Gemini 3.1 Pro",
    category: "Others",
    deletable: true,
    executable: true,
    inputs: [
      { id: "prompt", label: "Prompt", dataType: "text", required: true },
      { id: "system", label: "System Prompt", dataType: "text" },
      { id: "image", label: "Image (Vision)", dataType: "image", multi: true },
      { id: "video", label: "Video", dataType: "video" },
      { id: "audio", label: "Audio", dataType: "audio" },
      { id: "file", label: "File", dataType: "file" },
    ],
    outputs: [{ id: "text", label: "Response", dataType: "text" }],
  },
  response: {
    kind: "response",
    title: "Response",
    category: "Others",
    deletable: false,
    executable: false,
    inputs: [{ id: "input", label: "Final Output", dataType: "text" }],
    outputs: [],
  },
};

/** Resolve the data type carried by a given handle of a node. */
export function handleDataType(
  kind: NodeKind,
  data: WorkflowNodeData,
  handleId: string,
  direction: "source" | "target"
): PortDataType | null {
  if (kind === "request-inputs" && direction === "source") {
    const d = data as RequestInputsData;
    const field = d.fields.find((f) => `field-${f.id}` === handleId);
    return field ? (field.type === "image" ? "image" : "text") : null;
  }
  const spec = NODE_SPECS[kind];
  const ports = direction === "source" ? spec.outputs : spec.inputs;
  return ports.find((p) => p.id === handleId)?.dataType ?? null;
}

// ---------- Serialized graph (persistence + import/export) ----------

export const positionSchema = z.object({ x: z.number(), y: z.number() });

export const requestInputFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["text", "image"]),
  value: z.string(),
});

export const nodeDataSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("request-inputs"),
    label: z.string(),
    fields: z.array(requestInputFieldSchema),
  }),
  z.object({
    kind: z.literal("crop-image"),
    label: z.string(),
    cropX: z.number().min(0).max(100),
    cropY: z.number().min(0).max(100),
    cropWidth: z.number().min(1).max(100),
    cropHeight: z.number().min(1).max(100),
  }),
  z.object({
    kind: z.literal("gemini"),
    label: z.string(),
    prompt: z.string(),
    systemPrompt: z.string(),
    model: z.string().optional(),
  }),
  z.object({
    kind: z.literal("response"),
    label: z.string(),
  }),
]);

export const workflowNodeSchema = z.object({
  id: z.string(),
  type: z.enum(["request-inputs", "crop-image", "gemini", "response"]),
  position: positionSchema,
  data: nodeDataSchema,
});

export const workflowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceHandle: z.string().nullish(),
  target: z.string(),
  targetHandle: z.string().nullish(),
});

export const workflowGraphSchema = z.object({
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema),
});

export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;
export type SerializedNode = z.infer<typeof workflowNodeSchema>;
export type SerializedEdge = z.infer<typeof workflowEdgeSchema>;

export const workflowExportSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  graph: workflowGraphSchema,
});

export type WorkflowExport = z.infer<typeof workflowExportSchema>;
