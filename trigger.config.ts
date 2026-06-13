import { defineConfig } from "@trigger.dev/sdk/v3";
import { ffmpeg } from "@trigger.dev/build/extensions/core";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_nextflow",
  runtime: "node",
  logLevel: "log",
  dirs: ["./src/trigger"],
  maxDuration: 1800,
  build: {
    extensions: [
      ffmpeg(),
      // Regenerate Prisma Client for the Linux deploy container and bundle the schema.
      prismaExtension({ mode: "legacy", schema: "prisma/schema.prisma" }),
    ],
  },
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 1,
    },
  },
});
