import type { WorkflowGraph } from "./types";

/**
 * Pre-built 7-node sample workflow (exact spec from the brief):
 *
 *   Request-Inputs.image_field ──> Crop #1 (20/20/60/60) ──┐
 *                              └─> Crop #2 (0/0/100/50) ───┤ Image (Vision)
 *   Request-Inputs.text_field ──> Gemini #1 ─> Gemini #2 ──┴─> Final Gemini ─> Response
 *
 * T=0: Crop #1, Crop #2, Gemini #1 start concurrently. Gemini #2 follows
 * Gemini #1 without waiting on the crops. Final Gemini waits for both
 * crops + Gemini #2 (parallel-then-converge).
 */
export function buildSampleGraph(): WorkflowGraph {
  return {
    nodes: [
      {
        id: "request-inputs",
        type: "request-inputs",
        position: { x: 0, y: 220 },
        data: {
          kind: "request-inputs",
          label: "Request Inputs",
          fields: [
            {
              id: "text_field",
              name: "text_field",
              type: "text",
              value:
                "Product: Wireless Bluetooth Headphones. Features: Noise cancellation, 30-hour battery, foldable design.",
            },
            {
              id: "image_field",
              name: "image_field",
              type: "image",
              value: "",
            },
          ],
        },
      },
      {
        id: "crop-1",
        type: "crop-image",
        position: { x: 420, y: 0 },
        data: {
          kind: "crop-image",
          label: "Crop Image #1",
          cropX: 20,
          cropY: 20,
          cropWidth: 60,
          cropHeight: 60,
        },
      },
      {
        id: "crop-2",
        type: "crop-image",
        position: { x: 420, y: 430 },
        data: {
          kind: "crop-image",
          label: "Crop Image #2",
          cropX: 0,
          cropY: 0,
          cropWidth: 100,
          cropHeight: 50,
        },
      },
      {
        id: "gemini-1",
        type: "gemini",
        position: { x: 860, y: 180 },
        data: {
          kind: "gemini",
          label: "Gemini #1",
          prompt: "",
          systemPrompt:
            "You are a marketing copywriter. Write a one-paragraph product description.",
        },
      },
      {
        id: "gemini-2",
        type: "gemini",
        position: { x: 1300, y: 180 },
        data: {
          kind: "gemini",
          label: "Gemini #2",
          prompt: "",
          systemPrompt:
            "Condense the following product description into a tweet-length hook (under 240 characters).",
        },
      },
      {
        id: "gemini-final",
        type: "gemini",
        position: { x: 1740, y: 200 },
        data: {
          kind: "gemini",
          label: "Final Gemini",
          prompt: "",
          systemPrompt:
            "You are a social media manager. Combine the tweet hook and the two product crops into a final marketing post.",
        },
      },
      {
        id: "response",
        type: "response",
        position: { x: 2180, y: 260 },
        data: { kind: "response", label: "Response" },
      },
    ],
    edges: [
      // image_field fans out to both crops (single source, two targets).
      {
        id: "e-img-crop1",
        source: "request-inputs",
        sourceHandle: "field-image_field",
        target: "crop-1",
        targetHandle: "image",
      },
      {
        id: "e-img-crop2",
        source: "request-inputs",
        sourceHandle: "field-image_field",
        target: "crop-2",
        targetHandle: "image",
      },
      // text_field -> Gemini #1.Prompt
      {
        id: "e-text-gem1",
        source: "request-inputs",
        sourceHandle: "field-text_field",
        target: "gemini-1",
        targetHandle: "prompt",
      },
      // Sequential Gemini chain.
      {
        id: "e-gem1-gem2",
        source: "gemini-1",
        sourceHandle: "text",
        target: "gemini-2",
        targetHandle: "prompt",
      },
      {
        id: "e-gem2-final",
        source: "gemini-2",
        sourceHandle: "text",
        target: "gemini-final",
        targetHandle: "prompt",
      },
      // Both crops converge on Final Gemini's multi-connection Vision input.
      {
        id: "e-crop1-final",
        source: "crop-1",
        sourceHandle: "image",
        target: "gemini-final",
        targetHandle: "image",
      },
      {
        id: "e-crop2-final",
        source: "crop-2",
        sourceHandle: "image",
        target: "gemini-final",
        targetHandle: "image",
      },
      // Final output.
      {
        id: "e-final-response",
        source: "gemini-final",
        sourceHandle: "text",
        target: "response",
        targetHandle: "input",
      },
    ],
  };
}

/** Empty workflow: just the two mandatory non-deletable nodes. */
export function buildEmptyGraph(): WorkflowGraph {
  return {
    nodes: [
      {
        id: "request-inputs",
        type: "request-inputs",
        position: { x: 100, y: 200 },
        data: {
          kind: "request-inputs",
          label: "Request Inputs",
          fields: [
            { id: "text_field", name: "text_field", type: "text", value: "" },
          ],
        },
      },
      {
        id: "response",
        type: "response",
        position: { x: 700, y: 200 },
        data: { kind: "response", label: "Response" },
      },
    ],
    edges: [],
  };
}
