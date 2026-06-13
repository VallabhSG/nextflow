import { defineConfig } from "vitest/config";
import { loadEnvFile } from "node:process";
import path from "node:path";

// Load .env like Next.js does so integration tests see real credentials.
try {
  loadEnvFile(path.resolve(__dirname, ".env"));
} catch {
  // no .env present (CI) — tests relying on it will skip/fail explicitly
}

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
