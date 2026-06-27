import {
  test,
  expect,
  createWorkflow,
  createSampleWorkflow,
  deleteWorkflow,
} from "./fixtures";

// These tests execute a real workflow run (Trigger.dev + Gemini = time + cost),
// so they are opt-in. Enable with E2E_LIVE_RUN=1.
const LIVE = !!process.env.E2E_LIVE_RUN;

test.describe("live run behaviour", () => {
  test.skip(!LIVE, "set E2E_LIVE_RUN=1 to run billable workflow executions");

  // Issue #4: refreshing while a run is in progress must restore the running
  // state on the canvas (node glows / run spinner), not only the history panel.
  // Issue #1 (strong): after a run, opening a new workflow must not leak output.
  test("refresh re-attaches to a running run; a new workflow stays clean", async ({
    page,
  }) => {
    const sampleId = await createSampleWorkflow(page);
    try {
      // Kick off the full run.
      await page.getByRole("button", { name: "Run workflow" }).click();

      // Wait until the backend reports a RUNNING run for this workflow.
      await expect
        .poll(
          async () =>
            page.evaluate(async (wid) => {
              const res = await fetch(`/api/workflows/${wid}/runs`);
              const body = await res.json();
              return body.data?.[0]?.status ?? null;
            }, sampleId),
          { timeout: 20_000 }
        )
        .toBe("RUNNING");

      // Reload mid-run. Without the #4 fix the canvas would show nothing
      // (only the history panel), because load() nulls activeRunId on mount.
      await page.reload();

      // The canvas must reflect the run: either a live spinner while still
      // running, or node glows once the resumed poll catches completion.
      // Both only happen if the canvas re-attached to the run on mount.
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const glows = document.querySelectorAll(
                ".node-glow-running, .node-glow-success, .node-glow-failed"
              ).length;
              const spinner = document.querySelector(
                'button[title="Run workflow"] .animate-spin'
              )
                ? 1
                : 0;
              return glows + spinner;
            }),
          { timeout: 60_000 }
        )
        .toBeGreaterThan(0);

      // Issue #1 strong-form: create a NEW workflow — it must be pristine even
      // though the previous canvas was full of run state.
      const freshId = await createWorkflow(page);
      try {
        const clean = await page.evaluate(() => ({
          glows: document.querySelectorAll(
            ".node-glow-running, .node-glow-success, .node-glow-failed"
          ).length,
          responseText:
            document.querySelector(".react-flow__node-response")?.textContent ??
            "",
        }));
        expect(clean.glows).toBe(0);
        expect(clean.responseText).toMatch(/No output yet/i);
      } finally {
        await deleteWorkflow(page, freshId);
      }
    } finally {
      await deleteWorkflow(page, sampleId);
    }
  });
});
