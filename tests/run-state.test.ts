import { describe, expect, test, vi } from "vitest";
import { deriveRunState, type RunLike } from "@/lib/workflow/run-state";

// run.ts pulls in prisma + the Trigger.dev SDK at import time; stub them so we
// can unit-test the pure `withTimeout` helper without those side effects.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@trigger.dev/sdk/v3", () => ({ tasks: { trigger: vi.fn() } }));

import { withTimeout } from "@/lib/execution/run";

/**
 * Issue #4: refreshing or navigating back to a canvas while a run is in
 * progress must restore node statuses/outputs (not just the history panel).
 * deriveRunState is the pure projection that powers that re-attach.
 */
describe("deriveRunState", () => {
  test("projects node statuses, outputs, and final response output", () => {
    const run: RunLike = {
      id: "run-1",
      status: "RUNNING",
      nodeRuns: [
        { nodeId: "g1", nodeType: "gemini", status: "SUCCESS", outputs: { text: "hi" } },
        { nodeId: "c1", nodeType: "crop-image", status: "RUNNING", outputs: null },
        { nodeId: "r", nodeType: "response", status: "PENDING", outputs: { output: "final!" } },
      ],
    };

    const derived = deriveRunState(run);

    expect(derived.statuses).toEqual({ g1: "SUCCESS", c1: "RUNNING", r: "PENDING" });
    // Every node run with outputs is projected; nodes still pending are omitted.
    expect(derived.outputs).toEqual({
      g1: { text: "hi" },
      r: { output: "final!" },
    });
    expect(derived.responseOutput).toBe("final!");
  });

  test("response output is null when the response node has produced nothing yet", () => {
    const run: RunLike = {
      id: "run-2",
      status: "RUNNING",
      nodeRuns: [
        { nodeId: "r", nodeType: "response", status: "PENDING", outputs: null },
      ],
    };

    expect(deriveRunState(run).responseOutput).toBeNull();
  });
});

/**
 * Issue #3: the in-process dev runner had unbounded awaits (fetch / FFmpeg /
 * Gemini), so a hung node left the run RUNNING forever with no timeout or
 * error. withTimeout converts a hung node into a clear, terminal failure.
 */
describe("withTimeout", () => {
  test("rejects a hung promise after the deadline with a clear error", async () => {
    vi.useFakeTimers();
    try {
      const hung = new Promise<string>(() => {}); // never settles
      const guarded = withTimeout(hung, 5 * 60 * 1000, 'crop-image node "Crop #1"');
      const expectation = expect(guarded).rejects.toThrow(
        /crop-image node "Crop #1" timed out after 300s/
      );
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });

  test("resolves a fast promise and clears the timer", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1000, "x")).resolves.toBe(
      "ok"
    );
  });

  test("propagates the underlying rejection unchanged", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("boom")), 1000, "x")
    ).rejects.toThrow("boom");
  });
});
