# NextFlow — Workflow Builder 2.0

A pixel-faithful clone of the Galaxy.ai / Magica workflow builder focused on
LLM workflows: a visual canvas where you wire **Request Inputs → Crop Image /
Gemini → Response** nodes into a DAG and execute them as Trigger.dev tasks
with live status, history, and JSON import/export.

## Pages

| Route | Purpose |
|---|---|
| `/sign-in`, `/sign-up` | Clerk authentication (all other traffic redirects here) |
| `/app/workflows` | Dashboard — create, open, rename, delete workflows |
| `/app/workflows/[id]/canvas` | Workflow canvas — node picker, run controls, history panel |

## Tech Stack

Next.js (App Router) · TypeScript (strict) · PostgreSQL (Neon) · Prisma ·
Clerk · React Flow (`@xyflow/react`) · Trigger.dev v3 · Transloadit · FFmpeg ·
Tailwind CSS · Zustand · Zod · `@google/generative-ai` · Lucide React

## Features

- **Node types**
  - **Request Inputs** (pre-placed, non-deletable) — dynamic text/image fields,
    each with its own typed output handle; images upload via Transloadit
  - **Crop Image** — FFmpeg percentage-based crop, runs as a Trigger.dev task
    with a mandatory 30s+ processing window
  - **Gemini 3.1 Pro** — prompt + system prompt + vision/video/audio/file inputs
  - **Response** (pre-placed, non-deletable) — renders the final output
- **Canvas** — bottom-center “+” picker with searchable categories
  (Recent / Image / Video / Audio / Others), pan/zoom/fit-view, MiniMap,
  dot-grid background, animated purple edges, type-safe connections with
  invalid-drag rejection, DAG validation (no cycles), undo/redo
  (Ctrl+Z / Ctrl+Shift+Z), delete via toolbar or Backspace (mandatory nodes
  exempt)
- **Execution** — every executable node runs as a Trigger.dev task; independent
  nodes are scheduled concurrently by a dependency-driven promise scheduler and
  never block on unrelated siblings; executing nodes show a pulsating glow;
  run a single node, a multi-selection, or the full workflow
- **History panel** — every run is recorded with timestamp, status
  (success / failed / partial), duration and scope badge; expandable per-node
  details show status, inputs, outputs, execution time, and errors
- **Persistence** — PostgreSQL via Prisma, scoped to the authenticated Clerk
  user; JSON export/import of complete workflows

## Setup

```bash
npm install
cp .env.example .env   # then fill in your keys
npx prisma migrate dev # creates the schema (needs DATABASE_URL)
npm run dev
```

### Required keys (`.env`)

| Variable | Source |
|---|---|
| `DATABASE_URL` | Neon (PostgreSQL) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk dashboard |
| `GEMINI_API_KEY` | Google AI Studio |
| `TRIGGER_SECRET_KEY`, `TRIGGER_PROJECT_REF` | Trigger.dev dashboard |
| `TRANSLOADIT_AUTH_KEY`, `TRANSLOADIT_AUTH_SECRET` | Transloadit credentials |
| `NEXT_PUBLIC_LINKEDIN_URL` | your LinkedIn profile URL |

### Graceful fallbacks (local development)

- **No `TRIGGER_SECRET_KEY`** → nodes execute in-process inside the Next.js
  server (same scheduler, same DB writes). FFmpeg must be on your `PATH` for
  Crop Image nodes.
- **No Transloadit keys** → image uploads fall back to inline data URLs.

### Trigger.dev

```bash
npx trigger.dev@latest dev    # local task runner
npx trigger.dev@latest deploy # production
```

`trigger.config.ts` registers the FFmpeg build extension so Crop Image tasks
have `ffmpeg` available in the task image.

## Sample workflow

“New from sample (7 nodes)” on the dashboard creates the pre-built pipeline:

```
Request Inputs ─ image ─┬─> Crop (tight) ──> Gemini #1 (description) ─> Gemini #2 (hook) ─┐
                        └─> Crop (banner) ────────────────────────────────────────────────┴─> Gemini #3 (final post) ─> Response
               └ text ────^ (Gemini #1 prompt)
```

It demonstrates the concurrent Crop/Gemini fan-out, a sequential Gemini chain,
and a parallel-then-converge pattern into the final Gemini node.

## Architecture notes

- `src/lib/workflow/` — graph types (Zod), DAG/type-safety validation, sample graph
- `src/lib/execution/` — node executors (FFmpeg crop, Gemini), dependency-driven
  scheduler, run launcher (Trigger.dev or local fallback)
- `src/trigger/` — Trigger.dev v3 tasks (`crop-image`, `gemini`, `workflow-run`
  orchestrator)
- `src/store/workflow-store.ts` — Zustand canvas state with undo/redo stacks
- `src/app/api/` — REST endpoints (workflow CRUD, run start, run polling, history,
  Transloadit signatures) with a consistent `{ success, data, error }` envelope
