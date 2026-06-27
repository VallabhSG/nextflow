import { describe, expect, test } from "vitest";
import { useWorkflowStore } from "@/store/workflow-store";
import { buildEmptyGraph, buildSampleGraph } from "@/lib/workflow/sample";

/**
 * Regression: the Response node renders `responseOutput` straight from the
 * global (module-singleton) store, and Gemini nodes render `nodeOutputs`.
 * Client-side navigation (router.push) keeps that singleton alive, so opening
 * or creating a new workflow must clear the previous run's output — otherwise a
 * brand-new workflow shows a stale "Final Output" with no run behind it.
 */
describe("workflow store — load() resets prior run output", () => {
  test("clears responseOutput and nodeOutputs when a new workflow is loaded", () => {
    // Arrange: simulate a finished run that populated the global output state.
    const store = useWorkflowStore.getState();
    store.load("wf-1", "First", buildSampleGraph());
    store.setResponseOutput("Final marketing post from the previous run");
    store.setNodeOutputs({ "gemini-1": { text: "stale gemini output" } });

    // Act: open/create a different workflow — the singleton store is reused.
    store.load("wf-2", "Second", buildEmptyGraph());

    // Assert: the freshly loaded workflow shows no prior output.
    const next = useWorkflowStore.getState();
    expect(next.responseOutput).toBeNull();
    expect(next.nodeOutputs).toEqual({});
  });

  test("resetRunState clears live-run state on canvas unmount without touching the graph", () => {
    // Arrange: a workflow with a finished run still in the singleton store.
    const store = useWorkflowStore.getState();
    store.load("wf-1", "First", buildSampleGraph());
    store.setNodeStatuses({ "gemini-1": "SUCCESS" });
    store.setActiveRunId("run-xyz");
    store.setResponseOutput("Final marketing post");
    store.setNodeOutputs({ "gemini-1": { text: "stale" } });

    // Act: leaving the canvas resets run state (the next mount starts clean,
    // so no stale "Final Output" flashes before the next load()).
    store.resetRunState();

    // Assert: run state cleared, graph untouched.
    const next = useWorkflowStore.getState();
    expect(next.nodeStatuses).toEqual({});
    expect(next.activeRunId).toBeNull();
    expect(next.responseOutput).toBeNull();
    expect(next.nodeOutputs).toEqual({});
    expect(next.nodes.length).toBeGreaterThan(0);
    expect(next.workflowName).toBe("First");
  });

  test("resets the full live-run contract (statuses + active run + outputs)", () => {
    // Arrange
    const store = useWorkflowStore.getState();
    store.load("wf-1", "First", buildSampleGraph());
    store.setNodeStatuses({ "gemini-1": "SUCCESS" });
    store.setActiveRunId("run-123");
    store.setResponseOutput("leftover output");
    store.setNodeOutputs({ "gemini-1": { text: "leftover" } });

    // Act
    store.load("wf-2", "Second", buildEmptyGraph());

    // Assert
    const next = useWorkflowStore.getState();
    expect(next.nodeStatuses).toEqual({});
    expect(next.activeRunId).toBeNull();
    expect(next.responseOutput).toBeNull();
    expect(next.nodeOutputs).toEqual({});
  });
});
