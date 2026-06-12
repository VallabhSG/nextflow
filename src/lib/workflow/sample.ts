import type { WorkflowGraph } from "./types";

/**
 * Pre-built 7-node sample workflow:
 *
 *   Request Inputs ──image──> Crop (tight) ──┐
 *                 ├─image──> Crop (banner)   ├──> Gemini #1 (description)
 *                 └─text───────────────────┘        │
 *                                                   v
 *                                          Gemini #2 (tweet hook)
 *                                                   │
 *   (desc + hook + banner crop) ──converge──> Gemini #3 (final post)
 *                                                   │
 *                                                   v
 *                                               Response
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
              id: "product-text",
              name: "Product Details",
              type: "text",
              value:
                "Aurora X1 — noise-cancelling wireless headphones with 40h battery life, spatial audio, and USB-C fast charge.",
            },
            {
              id: "product-image",
              name: "Product Image",
              type: "image",
              value: "",
            },
          ],
        },
      },
      {
        id: "crop-tight",
        type: "crop-image",
        position: { x: 420, y: 40 },
        data: {
          kind: "crop-image",
          label: "Tight Product Crop",
          cropX: 25,
          cropY: 25,
          cropWidth: 50,
          cropHeight: 50,
        },
      },
      {
        id: "crop-banner",
        type: "crop-image",
        position: { x: 420, y: 420 },
        data: {
          kind: "crop-image",
          label: "Wide Banner Crop",
          cropX: 0,
          cropY: 30,
          cropWidth: 100,
          cropHeight: 40,
        },
      },
      {
        id: "gemini-description",
        type: "gemini",
        position: { x: 860, y: 80 },
        data: {
          kind: "gemini",
          label: "Product Description",
          prompt:
            "Write a compelling 2-3 sentence product description based on the product details and the product image.",
          systemPrompt:
            "You are a senior e-commerce copywriter. Be concise, vivid, and benefit-driven.",
        },
      },
      {
        id: "gemini-hook",
        type: "gemini",
        position: { x: 1300, y: 80 },
        data: {
          kind: "gemini",
          label: "Tweet Hook",
          prompt:
            "Turn this product description into a single scroll-stopping tweet hook (max 140 characters).",
          systemPrompt:
            "You are a viral social media ghostwriter. Output only the hook, no hashtags.",
        },
      },
      {
        id: "gemini-final",
        type: "gemini",
        position: { x: 1740, y: 240 },
        data: {
          kind: "gemini",
          label: "Final Social Post",
          prompt:
            "Combine the tweet hook with the banner image context into a final polished social media post with 2-3 relevant hashtags.",
          systemPrompt:
            "You are a brand social media manager. Keep it punchy and on-brand.",
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
      // Fan-out from Request Inputs: two crops + Gemini #1 run concurrently.
      {
        id: "e-img-croptight",
        source: "request-inputs",
        sourceHandle: "field-product-image",
        target: "crop-tight",
        targetHandle: "image",
      },
      {
        id: "e-img-cropbanner",
        source: "request-inputs",
        sourceHandle: "field-product-image",
        target: "crop-banner",
        targetHandle: "image",
      },
      {
        id: "e-text-gem1",
        source: "request-inputs",
        sourceHandle: "field-product-text",
        target: "gemini-description",
        targetHandle: "prompt",
      },
      // Tight crop feeds Gemini #1 vision.
      {
        id: "e-croptight-gem1",
        source: "crop-tight",
        sourceHandle: "image",
        target: "gemini-description",
        targetHandle: "image",
      },
      // Sequential Gemini chain.
      {
        id: "e-gem1-gem2",
        source: "gemini-description",
        sourceHandle: "text",
        target: "gemini-hook",
        targetHandle: "prompt",
      },
      // Parallel-then-converge: hook text + banner crop into final Gemini.
      {
        id: "e-gem2-gem3",
        source: "gemini-hook",
        sourceHandle: "text",
        target: "gemini-final",
        targetHandle: "prompt",
      },
      {
        id: "e-cropbanner-gem3",
        source: "crop-banner",
        sourceHandle: "image",
        target: "gemini-final",
        targetHandle: "image",
      },
      // Final output.
      {
        id: "e-gem3-response",
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
            { id: "input-1", name: "Input 1", type: "text", value: "" },
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
