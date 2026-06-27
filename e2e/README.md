# E2E tests (Playwright + Clerk)

End-to-end tests that drive a **deployed** instance of NextFlow in a real
browser and verify the reviewer-resubmission fixes:

| Spec | Verifies |
|------|----------|
| `workflow.spec.ts` | #5 crop input handles (present + aligned), #2 auto-save (saves edits, not on open), #1 new workflow shows no stale output |
| `live-run.spec.ts` | #4 refresh re-attaches to a running run, #1 strong-form (new workflow stays clean after a run) — **opt-in, billable** |

Each test creates and deletes its own workflow, so it leaves no residue.

## One-time setup

### 1. Create a dedicated Clerk test user
In the **same Clerk instance the deployment uses**, create a user with a known
email + password (password strategy must be enabled for the instance). Use a
throwaway account — the tests sign in as it on every run.

> Tip: Clerk's `+clerk_test` email subaddresses and the `424242` OTP work for
> development instances; for production, a real password user is simplest.

### 2. Provide environment variables
Locally, add these to `.env` (already git-ignored). In CI, add them as
**GitHub repository secrets**.

| Variable | What it is |
|----------|------------|
| `E2E_BASE_URL` | URL of the deployment to test (e.g. `https://nextflow-indol-mu.vercel.app`, or a per-PR Vercel preview URL) |
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key for that instance (`pk_...`) |
| `CLERK_SECRET_KEY` | Clerk secret key for that instance (`sk_...`) — used by `clerkSetup()` to mint a Testing Token |
| `E2E_CLERK_USER_EMAIL` | The test user's email |
| `E2E_CLERK_USER_PASSWORD` | The test user's password |
| `E2E_LIVE_RUN` | Set to `1` to also run the billable live-run tests (optional) |

## Running

```bash
# Deterministic tests (no workflow execution) against E2E_BASE_URL
npm run test:e2e

# Interactive UI mode
npm run test:e2e:ui

# Include the billable live-run tests
E2E_LIVE_RUN=1 npm run test:e2e
```

## CI

`.github/workflows/e2e.yml` runs the suite on **manual dispatch**
(`workflow_dispatch`). It is intentionally not wired to every push because it
mutates a live backend. To target a PR's own Vercel preview, pass that URL as
the `base_url` input (or wire a "wait for preview" step and set `E2E_BASE_URL`).

The `live_run` dispatch input toggles the billable `live-run.spec.ts` tests.
