# Workflow Engine

Temporal workflows and activities that orchestrate the order lifecycle. The workflow handles approval, vendor integration, technician polling, and manual review — all within one durable workflow.

## Setup

See the [project README](../../README.md#quick-start) for full setup instructions.

Start the dev worker:

```sh
cd apps/workflow-engine && pnpm run dev
```

Set up the orphan reconciler schedule (one-time):

```sh
pnpm --filter workflow-engine run setup-schedules
```

## Workflows

### `orderLifecycle`

The main workflow. Orchestrates the entire order lifecycle:

1. **Wait for approval** — Pauses via `condition()` until an approval signal is received
2. **Call vendor API** — Sends dispatch request, retries 3x with exponential backoff (via activity retry policy)
3. **Poll for tech assignment** — Checks vendor API every 30s until a technician is assigned
4. **Handle failures** — Vendor/polling failures enter a manual review loop (up to 3 cycles)

Key behaviors:
- Activity retries are handled by Temporal's retry policy, not in-code loops
- `maxConcurrentWorkflowTaskExecutions: 10` — At most 10 workflows execute concurrently per worker
- Checks for cancellation during polling and manual review wait

### `orphanReconciler`

Scheduled workflow (every 5 minutes) that scans for orders stuck in `PENDING_APPROVAL` without an active workflow. Re-triggers the `orderLifecycle` workflow — Temporal deduplicates by workflow ID.

## Workflow States

```
condition(approvalSignal)   →  Paused, zero resources
sleep(30s)                  →  Paused, zero resources (tech polling)
condition(reviewSignal)     →  Paused, zero resources (operator decision)
```

All `condition()` and `sleep()` calls checkpoint the workflow state and free the worker. The workflow resumes when the condition is met or the timer expires.

## Environment Variables

| Variable           | Description                              |
|--------------------|------------------------------------------|
| `VENDOR_API_URL`   | Mock vendor API URL (default: http://localhost:3003) |
| `TEMPORAL_ADDRESS` | Temporal server address (default: localhost:7233) |

## Project Structure

```
src/
  workflows/
    order-lifecycle.ts     # Main durable workflow
    orphan-reconciler.ts   # Safety net for orphaned orders
    index.ts               # Barrel export
  activities/
    vendor.ts              # Vendor API calls (HTTP)
    order.ts               # DB operations (transitions, updates)
    index.ts               # Barrel export
  shared.ts                # Signal definitions
  worker.ts                # Temporal worker startup
  setup-schedules.ts       # One-time schedule creation script
```
