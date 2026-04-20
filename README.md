# Order Management POC

A dispatch order management system built as a Turborepo monorepo. Demonstrates durable workflow orchestration using Trigger.dev, with human-in-the-loop (HITL) patterns, automatic retries, and long-running polling — all within a single resumable task.

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  External System │────▶│  Order Ingestion API  │────▶│  Trigger.dev    │
│                  │     │  (Express, port 3002) │     │  Workflow Engine │
└─────────────────┘     └──────────────────────┘     └────────┬────────┘
                                                              │
┌─────────────────┐     ┌──────────────────────┐              │
│  Web UI          │────▶│  Order Management API │──────────────┘
│  (Next.js, 3000)│     │  (Express, port 3004) │   (completes wait tokens)
└─────────────────┘     └──────────────────────┘
                                                     ┌─────────────────┐
                                                     │  Mock Vendor API │
                                                     │  (Express, 3003)│
                                                     └─────────────────┘
```

### Wait Tokens (Trigger.dev)

Trigger.dev's `wait.forToken()` pauses a workflow and checkpoints its state — freeing the worker entirely. Any external system can resume it by calling `wait.completeToken()` with data. This is a general-purpose mechanism for pausing workflows until an external event occurs, whether that's a human action, a webhook, or another service. The workflow resumes with the data passed to `completeToken()`.

In this project, we use tokens for:
- **Approval** — workflow pauses until the approval webhook completes the token with vendor info
- **Manual review** — workflow pauses until an operator submits a decision via the management API

### Key Patterns

- **HITL (Human-in-the-Loop):** Approval and manual review use wait tokens to pause the workflow for human decisions.
- **Retry with backoff:** Vendor API calls retry 3x with exponential backoff before entering manual review.
- **Durable polling:** Tech assignment polling uses `wait.for()` to pause the workflow between polls — the worker is freed and state is saved. When the wait expires, a new worker resumes execution. This is not crash recovery — if the task fails during active execution, it does not resume from the last wait point.
- **Centralized audit trail:** All status transitions go through `transitionOrder()` which atomically records history with metadata.

### Why Trigger.dev over cron jobs?

Cron jobs are stateless — they have no memory of prior runs. This workflow spans hours or days (waiting for human approval, polling vendor APIs). Trigger.dev saves execution state at each `wait.*` call and frees the worker. When the wait condition is met, it restores state and resumes. This allows long-running workflows without holding resources, but note that if a task fails during active execution (between waits), it does not automatically resume — the `onFailure` handler transitions the order to an appropriate status.

## Apps

| App | Description | Port | Docs |
|-----|-------------|------|------|
| [order-ingestion-api](apps/order-ingestion-api/) | External-facing API for creating orders and receiving approval webhooks | 3002 | [README](apps/order-ingestion-api/README.md) |
| [order-management-api](apps/order-management-api/) | Internal API for operator actions (manual review decisions) | 3004 | [README](apps/order-management-api/README.md) |
| [web](apps/web/) | Operator dashboard for viewing and managing orders | 3000 | [README](apps/web/README.md) |
| [workflow-engine](apps/workflow-engine/) | Trigger.dev tasks for the order lifecycle workflow | — | [README](apps/workflow-engine/README.md) |
| [mock-vendor-api](apps/mock-vendor-api/) | Simulates a vendor dispatch API for testing | 3003 | [README](apps/mock-vendor-api/README.md) |

## Shared Packages

| Package | Description |
|---------|-------------|
| `@repo/database` | Prisma schema, client, and shared transition logic |

## Prerequisites

- Node.js >= 18
- Docker (for PostgreSQL)
- pnpm
- Trigger.dev account (free tier)

## Quick Start

1. **Clone and install:**

   ```sh
   pnpm install
   ```

2. **Start PostgreSQL:**

   ```sh
   docker compose up -d
   ```

3. **Run database migrations:**

   ```sh
   cd packages/database && npx prisma migrate dev
   ```

4. **Set up environment variables:**

   Copy `.env.example` to `.env` in each app that has one:

   ```sh
   cp apps/order-ingestion-api/.env.example apps/order-ingestion-api/.env
   cp apps/order-management-api/.env.example apps/order-management-api/.env
   cp apps/workflow-engine/.env.example apps/workflow-engine/.env
   cp packages/database/.env.example packages/database/.env
   ```

   Then update the following:
   - `TRIGGER_SECRET_KEY` — Add your key from the Trigger.dev dashboard to `order-ingestion-api`, `order-management-api`, and `workflow-engine`
   - `DATABASE_URL` — Should already be set to `postgresql://postgres:postgres@localhost:5432/order_management`

5. **Start all services:**

   ```sh
   pnpm exec turbo dev
   ```

   This starts all apps including the workflow engine (Trigger.dev CLI).

## Testing the Full Workflow

### Postman Collection

Import `apps/order-ingestion-api/postman/order-ingestion-api.postman_collection.json` into Postman for pre-configured API requests.

### 1. Create an order

```sh
curl -X POST http://localhost:3002/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{
    "ticketId": "TKT-001",
    "siteAddress": "123 Main St, Springfield, IL 62704",
    "scheduledDateTime": "2026-05-01T10:00:00Z",
    "dispatchType": "New Install"
  }'
```

### 2. Approve the order

```sh
curl -X POST http://localhost:3002/webhooks/approval \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{"orderId": "<orderId>", "vendorName": "Acme Field Services"}'
```

### 3. Watch the workflow

After approval, the workflow automatically:
- Calls the vendor API to get a VON (Vendor Order Number)
- Polls every 30s for technician assignment
- Transitions to `CONFIRMED` when a tech is assigned

### 4. Close out the order

Open `http://localhost:3000`, click on the order, fill in closeout notes, and submit.

### 5. Test manual review

Stop the mock vendor API, create and approve a new order. After vendor API retries are exhausted, the order enters `MANUAL_REVIEW`. Use the review form in the web UI to retry, reassign to a different vendor, or cancel.

## Order Lifecycle

```
PENDING_APPROVAL → REQUEST_SENT → CONFIRMED → COMPLETED
       ↓               ↓              ↓
    CANCELED     MANUAL_REVIEW     CANCELED
       ↓          ↓        ↓
    FAILED    REQUEST_SENT  CANCELED
```

## Database

View and edit data directly:

```sh
cd packages/database && npx prisma studio
```

Reset the database:

```sh
docker compose down -v && docker compose up -d
cd packages/database && npx prisma migrate dev
```
