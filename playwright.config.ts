import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { loadEnvFile } from "node:process";

// Load .env locally so a developer can run `npm run test:e2e` without exporting
// vars by hand. In CI the values come from repository secrets (see e2e/README).
try {
  loadEnvFile(path.resolve(__dirname, ".env"));
} catch {
  // no .env (CI) — credentials come from the environment instead
}

// The deployed app to test against. Defaults to production; override with a
// preview URL in CI (E2E_BASE_URL) so PRs test their own deployment.
const baseURL =
  process.env.E2E_BASE_URL ?? "https://nextflow-indol-mu.vercel.app";

export default defineConfig({
  testDir: "./e2e",
  // clerkSetup() fetches a Testing Token once for the whole run.
  globalSetup: "./e2e/global-setup.ts",
  // Tests share one backend + one Clerk test user, so run serially.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
