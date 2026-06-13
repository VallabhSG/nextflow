/**
 * Integration tests against real infrastructure:
 *  - real FFmpeg binary (crop executor, mandatory 30s+ window)
 *  - real PostgreSQL (Docker: nextflow-pg on port 5455)
 *  - the actual startRun() pipeline with the local execution fallback
 *
 * Run the database first:
 *   docker run -d --name nextflow-pg -e POSTGRES_PASSWORD=nextflow \
 *     -e POSTGRES_DB=nextflow -p 5455:5432 postgres:16-alpine
 *   npx prisma migrate deploy
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

process.env.DATABASE_URL ??=
  "postgresql://postgres:nextflow@localhost:5455/nextflow";
delete process.env.TRIGGER_SECRET_KEY; // force the local fallback

const execFileAsync = promisify(execFile);

import { executeCropImage, CROP_DELAY_MS } from "@/lib/execution/executors";
import { startRun } from "@/lib/execution/run";
import { prisma } from "@/lib/prisma";
import type { WorkflowGraph } from "@/lib/workflow/types";

const TEST_USER = "integration-test-user";
let tempDir: string;
let testImageDataUrl: string;

beforeAll(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "nextflow-it-"));
  // Generate a real 200x100 PNG with FFmpeg.
  const imagePath = path.join(tempDir, "source.png");
  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:size=200x100",
    "-frames:v",
    "1",
    imagePath,
  ]);
  const buffer = await readFile(imagePath);
  testImageDataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  await prisma.workflow.deleteMany({ where: { userId: TEST_USER } });
  await prisma.$disconnect();
});

describe("FFmpeg crop executor (real binary)", () => {
  test(
    "crops a real image and honors the mandatory 30s window",
    { timeout: 90_000 },
    async () => {
      const started = Date.now();
      const result = await executeCropImage({
        imageUrl: testImageDataUrl,
        cropX: 25,
        cropY: 25,
        cropWidth: 50,
        cropHeight: 50,
      });
      const elapsed = Date.now() - started;

      expect(result.imageUrl).toMatch(/^data:image\/png;base64,/);
      expect(elapsed).toBeGreaterThanOrEqual(CROP_DELAY_MS);

      // Verify the output is a real 100x50 PNG (50% of 200x100).
      const outPath = path.join(tempDir, "cropped.png");
      const base64 = result.imageUrl.split(",")[1];
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outPath, Buffer.from(base64, "base64"));
      const { stdout } = await execFileAsync("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0",
        outPath,
      ]);
      expect(stdout.trim()).toBe("100,50");
    }
  );
});

describe("startRun pipeline (real Postgres + local fallback)", () => {
  test(
    "full run: request-inputs -> crop -> response persists statuses and outputs",
    { timeout: 120_000 },
    async () => {
      const graph: WorkflowGraph = {
        nodes: [
          {
            id: "in",
            type: "request-inputs",
            position: { x: 0, y: 0 },
            data: {
              kind: "request-inputs",
              label: "Inputs",
              fields: [
                { id: "img", name: "Image", type: "image", value: testImageDataUrl },
              ],
            },
          },
          {
            id: "crop",
            type: "crop-image",
            position: { x: 300, y: 0 },
            data: {
              kind: "crop-image",
              label: "Crop",
              cropX: 0,
              cropY: 0,
              cropWidth: 50,
              cropHeight: 100,
            },
          },
          {
            id: "out",
            type: "response",
            position: { x: 600, y: 0 },
            data: { kind: "response", label: "Response" },
          },
        ],
        edges: [
          {
            id: "e1",
            source: "in",
            sourceHandle: "field-img",
            target: "crop",
            targetHandle: "image",
          },
        ],
      };

      const workflow = await prisma.workflow.create({
        data: { name: "Integration Test", userId: TEST_USER, graph },
      });

      const runId = await startRun({
        workflowId: workflow.id,
        userId: TEST_USER,
        graph,
      });

      // Poll the DB like the UI does, until the run finishes.
      let run = await prisma.workflowRun.findUniqueOrThrow({
        where: { id: runId },
        include: { nodeRuns: true },
      });
      const deadline = Date.now() + 100_000;
      while (run.status === "RUNNING" && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        run = await prisma.workflowRun.findUniqueOrThrow({
          where: { id: runId },
          include: { nodeRuns: true },
        });
      }

      expect(run.status).toBe("SUCCESS");
      expect(run.scope).toBe("FULL");
      expect(run.durationMs).toBeGreaterThanOrEqual(CROP_DELAY_MS);

      const byNode = Object.fromEntries(run.nodeRuns.map((nr) => [nr.nodeId, nr]));
      expect(byNode["in"].status).toBe("SUCCESS");
      expect(byNode["crop"].status).toBe("SUCCESS");
      expect(byNode["out"].status).toBe("SUCCESS");

      const cropOutputs = byNode["crop"].outputs as { image?: string };
      expect(cropOutputs.image).toMatch(/^data:image\/png;base64,/);
      expect(byNode["crop"].durationMs).toBeGreaterThanOrEqual(CROP_DELAY_MS);
    }
  );

  test(
    "gemini node without API key fails gracefully and run is PARTIAL",
    { timeout: 30_000 },
    async () => {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

      const graph: WorkflowGraph = {
        nodes: [
          {
            id: "in",
            type: "request-inputs",
            position: { x: 0, y: 0 },
            data: {
              kind: "request-inputs",
              label: "Inputs",
              fields: [
                { id: "t", name: "Text", type: "text", value: "hello" },
              ],
            },
          },
          {
            id: "llm",
            type: "gemini",
            position: { x: 300, y: 0 },
            data: { kind: "gemini", label: "G", prompt: "say hi", systemPrompt: "" },
          },
          {
            id: "out",
            type: "response",
            position: { x: 600, y: 0 },
            data: { kind: "response", label: "Response" },
          },
        ],
        edges: [
          {
            id: "e1",
            source: "in",
            sourceHandle: "field-t",
            target: "llm",
            targetHandle: "prompt",
          },
          {
            id: "e2",
            source: "llm",
            sourceHandle: "text",
            target: "out",
            targetHandle: "input",
          },
        ],
      };

      const workflow = await prisma.workflow.create({
        data: { name: "Integration Test Gemini", userId: TEST_USER, graph },
      });

      const runId = await startRun({
        workflowId: workflow.id,
        userId: TEST_USER,
        graph,
      });

      let run = await prisma.workflowRun.findUniqueOrThrow({
        where: { id: runId },
        include: { nodeRuns: true },
      });
      const deadline = Date.now() + 20_000;
      while (run.status === "RUNNING" && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1000));
        run = await prisma.workflowRun.findUniqueOrThrow({
          where: { id: runId },
          include: { nodeRuns: true },
        });
      }

      expect(run.status).toBe("PARTIAL"); // inputs succeeded; llm failed; out skipped
      const byNode = Object.fromEntries(run.nodeRuns.map((nr) => [nr.nodeId, nr]));
      expect(byNode["llm"].status).toBe("FAILED");
      expect(byNode["llm"].error).toMatch(/GEMINI_API_KEY/);
      expect(byNode["out"].status).toBe("SKIPPED");
    }
  );
});
