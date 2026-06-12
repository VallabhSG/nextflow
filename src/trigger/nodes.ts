import { task } from "@trigger.dev/sdk/v3";
import {
  executeCropImage,
  executeGemini,
  type CropImagePayload,
  type GeminiPayload,
} from "@/lib/execution/executors";

/** Crop Image node — FFmpeg crop with the mandatory 30s+ processing delay. */
export const cropImageTask = task({
  id: "crop-image",
  maxDuration: 300,
  run: async (payload: CropImagePayload) => {
    return executeCropImage(payload);
  },
});

/** Gemini 3.1 Pro node — multimodal LLM call. */
export const geminiTask = task({
  id: "gemini",
  maxDuration: 300,
  run: async (payload: GeminiPayload) => {
    return executeGemini(payload);
  },
});
