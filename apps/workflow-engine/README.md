# Workflow Engine

Trigger.dev tasks that orchestrate the order lifecycle as a single durable workflow. The workflow handles approval, vendor integration, technician polling, and manual review — all within one resumable task.

## Setup

See the [project README](../../README.md#quick-start) for full setup instructions.

Start the dev worker:

```sh
cd apps/workflow-engine && npx trigger.dev@latest dev
```

## Tasks

### `order-lifecycle`

The main workflow task. Orchestrates the entire order lifecycle:

1. **Wait for approval** — Pauses via `wait.forToken()` until the approval webhook completes the token
2. **Call vendor API** — Sends dispatch request, retries 3x with exponential backoff
3. **Poll for tech assignment** — Checks vendor API every 30s until a technician is assigned
4. **Handle failures** — Vendor/polling failures enter a manual review loop (up to 3 cycles)

Key behaviors:
- `retry: { maxAttempts: 1 }` — Task-level retries are disabled; the in-code manual review loop handles failures
- `queue: { concurrencyLimit: 10 }` — At most 10 workflows execute concurrently
- `maxDuration: 86400` — 24-hour maximum execution time
- Checks for cancellation during polling and manual review wait

### `orphan-reconciler`

Scheduled task that scans for orders stuck in `PENDING_APPROVAL` without an active workflow. Re-triggers the `order-lifecycle` task with an idempotency key to prevent duplicates.

## Workflow States

```
wait.forToken(approval)     →  Paused, zero resources
wait.for({ seconds: 30 })   →  Paused, zero resources (tech polling)
wait.forToken(manual-review) →  Paused, zero resources (operator decision)
```

All `wait.*` calls checkpoint the workflow state and free the worker. The workflow resumes when the condition is met.

## Environment Variables

| Variable           | Description                              |
|--------------------|------------------------------------------|
| `VENDOR_API_URL`   | Mock vendor API URL (default: http://localhost:3003) |
| `TRIGGER_SECRET_KEY` | Set automatically by `npx trigger.dev dev` |

## Project Structure

```
src/
  trigger/
    order-lifecycle.ts     # Main durable workflow task
    orphan-reconciler.ts   # Safety net for orphaned orders
trigger.config.ts          # Trigger.dev project configuration
```
