import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CropImagePayload {
  imageUrl: string;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
}

export interface GeminiPayload {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  /** Image (Vision) accepts multiple simultaneous connections. */
  imageUrls?: string[];
  videoUrl?: string;
  audioUrl?: string;
  fileUrl?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Mandatory processing delay for Crop Image nodes (per spec: 30+ seconds). */
export const CROP_DELAY_MS = 30_000;

interface FetchedMedia {
  buffer: Buffer;
  mimeType: string;
}

async function fetchMedia(url: string): Promise<FetchedMedia> {
  if (url.startsWith("data:")) {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
    if (!match) throw new Error("Malformed data URL");
    const mimeType = match[1] || "application/octet-stream";
    const data = match[3];
    const buffer = match[2]
      ? Buffer.from(data, "base64")
      : Buffer.from(decodeURIComponent(data), "utf8");
    return { buffer, mimeType };
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch media (${res.status}): ${url}`);
  const mimeType = res.headers.get("content-type") ?? "application/octet-stream";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mimeType };
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  return "jpg";
}

/**
 * Crop an image with FFmpeg. Crop region is expressed in percentages of
 * the source dimensions. Returns the result as a data URL.
 */
export async function executeCropImage(
  payload: CropImagePayload
): Promise<{ imageUrl: string }> {
  if (!payload.imageUrl) {
    throw new Error("Crop Image: no input image connected");
  }

  const media = await fetchMedia(payload.imageUrl);
  const ext = extensionFor(media.mimeType);
  const dir = await mkdtemp(path.join(tmpdir(), "nextflow-crop-"));
  const inputPath = path.join(dir, `in.${ext}`);
  const outputPath = path.join(dir, `out.${ext}`);

  try {
    await writeFile(inputPath, media.buffer);

    const { cropX, cropY, cropWidth, cropHeight } = payload;
    const filter = `crop=iw*${cropWidth / 100}:ih*${cropHeight / 100}:iw*${cropX / 100}:ih*${cropY / 100}`;

    // Mandatory minimum processing time runs concurrently with the crop.
    const [, croppedBuffer] = await Promise.all([
      sleep(CROP_DELAY_MS),
      (async () => {
        await execFileAsync("ffmpeg", [
          "-y",
          "-i",
          inputPath,
          "-vf",
          filter,
          outputPath,
        ]);
        return readFile(outputPath);
      })(),
    ]);

    return {
      imageUrl: `data:${media.mimeType};base64,${croppedBuffer.toString("base64")}`,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.1-pro";

/** Execute a Gemini node: multimodal generate call. */
export async function executeGemini(
  payload: GeminiPayload
): Promise<{ text: string }> {
  const apiKey =
    process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Gemini: GEMINI_API_KEY is not configured. Add it to your environment."
    );
  }
  if (!payload.prompt?.trim()) {
    throw new Error("Gemini: prompt is empty");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: payload.model?.trim() || GEMINI_MODEL,
    ...(payload.systemPrompt?.trim()
      ? { systemInstruction: payload.systemPrompt }
      : {}),
  });

  const parts: Part[] = [{ text: payload.prompt }];

  const mediaUrls = [
    ...(payload.imageUrls ?? []),
    payload.videoUrl,
    payload.audioUrl,
    payload.fileUrl,
  ].filter((u): u is string => Boolean(u));

  for (const url of mediaUrls) {
    const media = await fetchMedia(url);
    parts.push({
      inlineData: {
        mimeType: media.mimeType,
        data: media.buffer.toString("base64"),
      },
    });
  }

  const result = await model.generateContent(parts);
  const text = result.response.text();
  if (!text) throw new Error("Gemini returned an empty response");
  return { text };
}
