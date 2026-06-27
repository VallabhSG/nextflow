import { test as base, expect, type Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. See e2e/README.md for the list of ` +
        `secrets the E2E suite needs.`
    );
  }
  return value;
}

/**
 * Extends Playwright's `page` so every test starts signed in as the dedicated
 * E2E Clerk user. The Testing Token (from global setup) is injected first so
 * Clerk's bot protection allows the programmatic sign-in.
 */
export const test = base.extend({
  // `provide` is Playwright's fixture-value callback (positional — the name is
  // ours). We avoid the conventional name `use` so the react-hooks lint rule
  // doesn't misread `use(page)` as a React hook call.
  page: async ({ page }, provide) => {
    await setupClerkTestingToken({ page });
    // Must load an unprotected page that mounts Clerk before signing in.
    await page.goto("/sign-in");
    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: requireEnv("E2E_CLERK_USER_EMAIL"),
        password: requireEnv("E2E_CLERK_USER_PASSWORD"),
      },
    });
    await provide(page);
  },
});

export { expect };

// ---------- Shared helpers ----------

/** Create a fresh empty workflow and return its id (canvas is loaded). */
export async function createWorkflow(page: Page): Promise<string> {
  await page.goto("/app/workflows");
  await page.getByRole("button", { name: "New workflow" }).click();
  await page.waitForURL(/\/app\/workflows\/[^/]+\/canvas/);
  const match = page.url().match(/workflows\/([^/]+)\/canvas/);
  if (!match) throw new Error(`Could not parse workflow id from ${page.url()}`);
  return match[1];
}

/** Create the pre-built 7-node sample workflow and return its id. */
export async function createSampleWorkflow(page: Page): Promise<string> {
  await page.goto("/app/workflows");
  await page.getByRole("button", { name: /New from sample/i }).click();
  await page.waitForURL(/\/app\/workflows\/[^/]+\/canvas/);
  const match = page.url().match(/workflows\/([^/]+)\/canvas/);
  if (!match) throw new Error(`Could not parse workflow id from ${page.url()}`);
  return match[1];
}

/** Delete a workflow via the API so tests leave no residue in the backend. */
export async function deleteWorkflow(page: Page, id: string): Promise<void> {
  await page.evaluate(
    (wid) => fetch(`/api/workflows/${wid}`, { method: "DELETE" }),
    id
  );
}
