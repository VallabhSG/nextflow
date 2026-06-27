import {
  test,
  expect,
  createWorkflow,
  deleteWorkflow,
} from "./fixtures";

// These tests don't execute any workflow (no Trigger.dev / Gemini cost) and are
// safe to run on every CI run. Each test creates and deletes its own workflow.
test.describe("workflow canvas (no run)", () => {
  // Issue #5: crop parameters must be connectable input handles, aligned to
  // their fields (the alignment regression the reviewer flagged).
  test("crop node exposes aligned X/Y/W/H input handles", async ({ page }) => {
    const id = await createWorkflow(page);
    try {
      await page.getByRole("button", { name: "Add node" }).last().click();
      await page.getByRole("button", { name: /Crop Image/ }).click();
      await expect(page.locator(".react-flow__node-crop-image")).toBeVisible();

      const result = await page.evaluate(() => {
        const node = document.querySelector(".react-flow__node-crop-image")!;
        const handles = [...node.querySelectorAll(".react-flow__handle-left")].map(
          (h) => {
            const r = h.getBoundingClientRect();
            return {
              id: h.getAttribute("data-handleid"),
              isText: /handle-text/.test(h.className),
              cy: r.top + r.height / 2,
            };
          }
        );
        const inputs = [...node.querySelectorAll("input[type=number]")].map((i) => {
          const r = i.getBoundingClientRect();
          return r.top + r.height / 2;
        });
        const dims = ["cropX", "cropY", "cropWidth", "cropHeight"];
        const maxGap = Math.max(
          ...dims.map((d, idx) => {
            const h = handles.find((x) => x.id === d);
            return h ? Math.abs(h.cy - inputs[idx]) : 999;
          })
        );
        return {
          handleIds: handles.map((h) => h.id),
          dimsAreTextType: dims.every((d) =>
            handles.find((h) => h.id === d && h.isText)
          ),
          maxGap,
        };
      });

      expect(result.handleIds).toEqual(
        expect.arrayContaining(["image", "cropX", "cropY", "cropWidth", "cropHeight"])
      );
      expect(result.dimsAreTextType).toBe(true);
      expect(result.maxGap).toBeLessThan(8);
    } finally {
      await deleteWorkflow(page, id);
    }
  });

  // Issue #2: auto-save persists real edits after a debounce, and (the gate)
  // does NOT fire just from opening a workflow.
  test("auto-saves edits but not on open", async ({ page }) => {
    const id = await createWorkflow(page);
    try {
      let patchCount = 0;
      const onRequest = (req: { method(): string; url(): string }) => {
        if (req.method() === "PATCH" && req.url().includes(`/api/workflows/${id}`)) {
          patchCount += 1;
        }
      };
      page.on("request", onRequest);

      // Gate: opening (reloading) the workflow must not trigger a save.
      await page.reload();
      await expect(page.locator("input.w-52")).toBeVisible();
      await page.waitForTimeout(4000);
      expect(patchCount, "no auto-save should fire on open").toBe(0);

      // A real edit must auto-save within the debounce window.
      const newName = `E2E Autosave ${Date.now()}`;
      await page.locator("input.w-52").fill(newName);
      await page.waitForResponse(
        (r) =>
          r.url().includes(`/api/workflows/${id}`) &&
          r.request().method() === "PATCH" &&
          r.ok()
      );
      expect(patchCount).toBeGreaterThan(0);
      page.off("request", onRequest);

      // And it actually persisted.
      await page.reload();
      await expect(page.locator("input.w-52")).toHaveValue(newName);
    } finally {
      await deleteWorkflow(page, id);
    }
  });

  // Issue #1 (baseline): a brand-new workflow shows no Final Output.
  test("new workflow shows no stale Final Output", async ({ page }) => {
    const id = await createWorkflow(page);
    try {
      await expect(page.locator(".react-flow__node-response")).toContainText(
        "No output yet"
      );
    } finally {
      await deleteWorkflow(page, id);
    }
  });
});
