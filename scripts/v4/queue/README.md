# ORANGEBOX v4 — Background Agent Queue

Module: `bg-agent-queue.mjs`
Doctrine: ATOM-OBX-V4-MOAT-2026-0516
Rule: Zero npm deps. Receipts on every state transition. Local-first.

---

## Overview

The background agent queue lets the operator say "do X overnight, wake me when done."
Jobs persist in `<ORANGEBOX_DATA_ROOT>/queue/state.json`.
Every state transition emits a JSON receipt to `<ORANGEBOX_DATA_ROOT>/receipts/queue/`.

Data root defaults to `~/.orangebox`. Override with `ORANGEBOX_DATA_ROOT` env var.

Worker auto-routes: `codexa-lan` if `ORANGEBOX_CODEXA_IP` is set, `codexa-cloud` if
`ORANGEBOX_CODEXA_CLOUD_URL` is set, otherwise `local`.

---

## Usage examples

### Example 1 — Overnight code audit

Queue a security audit job before shutting down for the night.
Start the worker loop. Wake up to receipts.

```sh
# Enqueue the job (priority 1 = highest)
node bg-agent-queue.mjs --enqueue \
  --title="Security audit: routes directory" \
  --prompt="Scan all files in routes/ for SQL injection, open redirect, and missing auth guards. Emit findings as receipt." \
  --priority=1

# Confirm it is queued
node bg-agent-queue.mjs --list --status=queued

# Start the worker loop (demo dispatch — replace with Codexa rail in production)
node bg-agent-queue.mjs --worker-loop --poll-ms=3000
# Ctrl-C to stop when done
```

Receipts appear under `~/.orangebox/receipts/queue/` for every transition:
`queued`, `queued→running`, `running→done`.

---

### Example 2 — Programmatic use (Codexa rail dispatch)

Import the queue into your own orchestrator and provide a real dispatch function
that calls the Codexa rail.

```js
import {
  enqueue,
  runWorkerLoop,
  markRunning,
  markDone,
  markFailed
} from "./bg-agent-queue.mjs";

// Enqueue a job
await enqueue({
  title: "Generate OpenAPI spec from routes",
  prompt: "Read all Express route files and output a valid OpenAPI 3.1 YAML spec to docs/api.yaml.",
  priority: 3,
  worker: "codexa-lan"   // override smart router
});

// Custom dispatch — swap this body for your real Codexa HTTP call
async function codexaDispatch(job) {
  const response = await fetch("http://codexa-lan:8099/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: job.prompt, jobId: job.id })
  });
  if (!response.ok) throw new Error(`Codexa returned ${response.status}`);
  const data = await response.json();
  return data.result;
}

// Run the loop — runs until SIGINT/SIGTERM
await runWorkerLoop({ pollMs: 5000, dispatch: codexaDispatch });
```

---

### Example 3 — Cancel a stuck job and inspect stats

```sh
# List all jobs to find the stuck one
node bg-agent-queue.mjs --list

# Inspect a specific job
node bg-agent-queue.mjs --status=4ac5e927-ba9d-41b2-b03c-ac1e836999be

# Cancel it (only works if status is "queued")
node bg-agent-queue.mjs --cancel=4ac5e927-ba9d-41b2-b03c-ac1e836999be

# Confirm via stats
node bg-agent-queue.mjs --stats
```

Output:
```
[queue stats]
  total     : 3
  queued    : 1
  running   : 0
  done      : 1
  failed    : 0
  cancelled : 1
  next job  : [p1] Audit all API routes for SQL injection (ef69b407...)
  state     : C:\Users\a\.orangebox\queue\state.json
  receipts  : C:\Users\a\.orangebox\receipts\queue
```

---

## Job schema

| Field | Type | Description |
|---|---|---|
| `id` | string (uuid v4) | Stable job identifier |
| `title` | string | Human-readable job name |
| `prompt` | string | Full instruction for the agent |
| `provider` | string \| null | Model provider hint (passed to dispatch) |
| `priority` | 1-9 | 1 = highest. Default 5. |
| `createdAt` | ISO8601 | When job was enqueued |
| `startedAt` | ISO8601 \| null | When worker picked it up |
| `completedAt` | ISO8601 \| null | When job finished or was cancelled |
| `status` | string | `queued` `running` `done` `failed` `cancelled` |
| `worker` | string | `local` `codexa-lan` `codexa-cloud` |
| `receiptPath` | string \| null | Absolute path to latest receipt |
| `error` | string \| null | Error message on failure |
| `result` | any \| null | Resolved result from dispatch |

---

## Receipt schema

Every receipt lives at `<ORANGEBOX_DATA_ROOT>/receipts/queue/<id>-<transition>.json`.

```json
{
  "id": "ef69b407-933d-40cb-af51-d04dd2bfd0d0",
  "transition": "queued",
  "at": "2026-05-16T19:56:10.727Z",
  "worker": "local",
  "summary": "Job enqueued: Audit all API routes for SQL injection",
  "evidence": {
    "title": "Audit all API routes for SQL injection",
    "priority": 1,
    "worker": "local"
  }
}
```

Transitions emitted: `queued`, `queued→running`, `running→done`, `running→failed`, `queued→cancelled`.

---

## Environment variables

| Variable | Effect |
|---|---|
| `ORANGEBOX_DATA_ROOT` | Override data root (default `~/.orangebox`) |
| `ORANGEBOX_CODEXA_IP` | If set, smart router picks `codexa-lan` |
| `ORANGEBOX_CODEXA_CLOUD_URL` | If set, smart router picks `codexa-cloud` |

---

## Exported API

```js
enqueue(job)                          // → stored job record
dequeue()                             // → highest-priority queued job | null
peek()                                // → same as dequeue, non-destructive
list({ status, limit })               // → job[]
cancel(id)                            // → updated job record
markRunning(id, worker)               // → updated job record
markDone(id, { receiptPath, result }) // → updated job record
markFailed(id, error)                 // → updated job record
stats()                               // → { counts, nextJob, dataRoot, ... }
runWorkerLoop({ pollMs, dispatch })   // → never resolves (runs until SIGINT)
```
