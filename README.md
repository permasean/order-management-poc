# Order Management POC

A dispatch order management system built as a Turborepo monorepo. Demonstrates durable workflow orchestration using Trigger.dev, with human-in-the-loop (HITL) patterns, automatic retries, and long-running polling — all within a single resumable task.

## Architecture

```
External System ----> Order Ingestion API (3002) ----> Workflow Engine (Trigger.dev)
                                                             |
                                                             |  calls
                                                             v
Web UI (3000) ----------> Order Management API (3004)   Mock Vendor API (3003)
                          (completes wait tokens)
```

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Monorepo | Turborepo + pnpm workspaces | Shared database package across apps, single `pnpm exec turbo dev` to start everything, independent deployability per app |
| Workflow engine | Trigger.dev | Durable execution with `wait.*` primitives eliminates custom state machines, outbox tables, and recovery logic. Tasks checkpoint at wait points and resume without holding resources |
| Database | PostgreSQL + Prisma | Type-safe ORM, automatic migrations, shared schema across all apps via `@repo/database` |
| API framework | Express | Lightweight, well-documented, sufficient for a POC. Fastify or NestJS would be better for production (built-in validation, OpenAPI) |
| Frontend | Next.js + server components | Direct Prisma queries in page components, server actions for mutations, no API layer needed for reads |
| Auth | Mock middleware | Checks for Bearer token presence but accepts any value. Documents where OAuth/JWT validation would go in production |
| PDF | pdfkit (server-side) | Pure Node.js, no browser dependencies, generates on-demand and caches to local storage |
| Separate ingestion vs management API | Two Express apps | Ingestion API is external-facing (could be serverless), management API talks to Trigger.dev (needs SDK). Different security boundaries, different scaling characteristics |

### Why Trigger.dev over cron jobs?

Cron jobs are stateless — they have no memory of prior runs. This workflow spans hours or days (waiting for human approval, polling vendor APIs). Trigger.dev saves execution state at each `wait.*` call and frees the worker. When the wait condition is met, it restores state and resumes. This allows long-running workflows without holding resources, but note that if a task fails during active execution (between waits), it does not automatically resume — the `onFailure` handler transitions the order to an appropriate status.

### Wait Tokens (Trigger.dev)

Trigger.dev's `wait.forToken()` pauses a workflow and checkpoints its state — freeing the worker entirely. Any external system can resume it by calling `wait.completeToken()` with data. This is a general-purpose mechanism for pausing workflows until an external event occurs, whether that's a human action, a webhook, or another service. The workflow resumes with the data passed to `completeToken()`.

In this project, we use tokens for:
- **Approval** — workflow pauses until the approval webhook completes the token with vendor info
- **Manual review** — workflow pauses until an operator submits a decision via the management API

### Idempotency Keys

Idempotency keys are unique identifiers attached to an operation to ensure it only happens once. If the same key is used again, the duplicate is silently ignored. This project uses them in two places:

- **Workflow triggers:** `tasks.trigger("order-lifecycle", payload, { idempotencyKey: "order-lifecycle:<orderId>" })` — prevents duplicate workflows for the same order, even if the trigger is called multiple times (e.g., by the orphan reconciler).
- **Wait tokens:** `wait.createToken({ idempotencyKey: "approval:<orderId>" })` — ensures each workflow step creates exactly one token. If the same key is reused, Trigger.dev returns the existing token instead of creating a new one.

### Key Patterns

- **HITL (Human-in-the-Loop):** Approval and manual review use wait tokens to pause the workflow for human decisions.
- **Retry with backoff:** Vendor API calls retry 3x with exponential backoff before entering manual review.
- **Durable polling:** Tech assignment polling uses `wait.for()` to pause the workflow between polls — the worker is freed and state is saved. When the wait expires, a new worker resumes execution. This is not crash recovery — if the task fails during active execution, it does not resume from the last wait point.
- **Centralized audit trail:** All status transitions go through `transitionOrder()` which atomically records history with metadata.
- **Orphan reconciler:** A scheduled Trigger.dev task that scans for orders stuck in `PENDING_APPROVAL` without an active workflow. This handles the edge case where the API server crashes between creating the order in the database and triggering the workflow — the order would be orphaned with no workflow processing it. The reconciler re-triggers the workflow with an idempotency key, so duplicate triggers are safe.

## Order Lifecycle

```
PENDING_APPROVAL → REQUEST_SENT → CONFIRMED → COMPLETED
       ↓               ↓              ↓
    CANCELED     MANUAL_REVIEW     CANCELED
       ↓          ↓        ↓
    FAILED    REQUEST_SENT  CANCELED
```

## Failure Handling

Every step in the order lifecycle has explicit failure handling:

| Step | Failure Mode | How It's Handled |
|------|-------------|-----------------|
| Order creation | API crashes after DB write but before `tasks.trigger()` | Orphan reconciler detects the stuck order and re-triggers the workflow |
| Order creation | `tasks.trigger()` called twice | Idempotency key prevents duplicate workflows |
| Approval webhook | External system sends duplicate approval | Idempotent — returns 200 if already approved |
| Approval wait | No approval received within timeout | Workflow fails → order transitions to `FAILED` |
| Vendor API call | API unreachable or returns error | Retries 3x with exponential backoff |
| Vendor API call | All retries exhausted | Order transitions to `MANUAL_REVIEW` for operator intervention |
| Manual review | Operator submits duplicate decision | Token already completed — returns 409 |
| Manual review | 3 review cycles exhausted (vendor keeps failing) | Order transitions to `FAILED` |
| Manual review | No operator action within 7 days | Review token times out → order transitions to `FAILED` |
| Tech polling | Order canceled via UI during polling | Detected on next poll cycle, workflow exits cleanly |
| Tech polling | Max polls exceeded | Order transitions to `MANUAL_REVIEW` |
| Status transitions | Invalid transition attempted | Rejected by `transitionOrder()` validation |

### How an order reaches `FAILED`

`FAILED` is a terminal status introduced beyond the original scope for unrecoverable workflow failures — distinct from `CANCELED` (intentional operator action):

1. **Approval timeout** — No one approved the order within the configured window (10 minutes in POC)
2. **Max review attempts exceeded** — The vendor API failed, operators retried 3 times through manual review, and it still failed
3. **Review timeout** — Order entered `MANUAL_REVIEW` but no operator acted within 7 days

## Beyond Scope

The following were added beyond the original requirements:

- **`FAILED` status:** Not in the original spec. Added as a terminal status for unrecoverable workflow failures (approval timeout, max review attempts exceeded). Distinguishes between intentional cancellation (`CANCELED` — operator action) and system-level failure (`FAILED` — no human intervention possible within the allowed window).
- **`MANUAL_REVIEW` status:** The spec required routing to a "human exception queue" after vendor API retries are exhausted. We implemented this as a first-class workflow state with a dedicated UI, allowing operators to retry, reassign to a different vendor, or cancel — all while the workflow remains paused via `wait.forToken()`.
- **Orphan reconciler:** Safety net for orders where the API server crashes between database write and workflow trigger.
- **Idempotency:** Duplicate-safe workflow triggers and wait token creation across all entry points.

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
| `@repo/config` | Centralized workflow configuration — token keys, timeouts, retry counts, poll intervals. Single source of truth across all apps |

## Quick Start

### Prerequisites

- Node.js >= 18
- Docker (for PostgreSQL)
- pnpm
- Trigger.dev account (free tier)

### Setup

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

5. **Run tests:**

   ```sh
   pnpm test
   ```

   All tests are unit tests with mocked dependencies — no database or external services required.

6. **Start all services:**

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

### 4. Download work order PDF

Once the order is `CONFIRMED`, open the detail view and click "Download Work Order". A PDF is generated with order details and technician info, saved to local storage, and downloaded. Subsequent clicks return the cached PDF.

### 5. Close out the order

Open `http://localhost:3000`, click on the order, fill in closeout notes, and submit.

### 6. Test manual review

Stop the mock vendor API, create and approve a new order. After vendor API retries are exhausted, the order enters `MANUAL_REVIEW`. Use the review form in the web UI to retry, reassign to a different vendor, or cancel.

## What's Included vs. Not Yet Implemented

### Included

| Feature | Status |
|---------|--------|
| Order Ingestion API (create order, validation, mock auth) | Done |
| Approval Webhook (status transition, idempotent) | Done |
| Vendor API Integration (retry with backoff) | Done |
| Technician Polling (durable, cancel-aware) | Done |
| Job Closeout (notes, timestamp, status transition) | Done |
| Manual Review / Exception Queue (retry, reassign, cancel) | Done |
| Audit Trail (every transition with metadata) | Done |
| Web UI — List View (table, status badges, filtering) | Done |
| Web UI — Detail View (all fields, workflow history, metadata tags) | Done |
| Work Order PDF (on-demand generation, cached) | Done |
| Orphan Reconciler (safety net for stuck orders) | Done |
| Failure Handling (comprehensive, documented) | Done |

### Not Yet Implemented

| Feature | Complexity | Approach |
|---------|-----------|----------|
| Technician Notification (SMS/email on CONFIRMED) | Low | Add a `fetch` call to SendGrid/Twilio after the CONFIRMED transition in the workflow. Single API call with tech phone/email and order details. |
| AI-Assisted Closeout Summary | Low-Medium | Vercel AI SDK (`ai` package) for model-agnostic LLM calls. After closeout submission, generate a structured summary (work performed, issues found, materials used). Store on the order, display in detail view. |
| OpenAPI/Swagger Compliance | Medium | Add `tsoa` or `swagger-jsdoc` to Express apps for auto-generated API specs. Or migrate to NestJS for built-in OpenAPI support. |
| Real-time Dashboard | Medium-High | Redis pub/sub for event fan-out, tRPC subscriptions with SSE for live updates. Trigger.dev tasks publish to Redis after status changes, web app subscribes. |
| API Integration Tests | Medium | Supertest for API endpoint testing against a test database (separate Postgres instance or Testcontainers). |
| End-to-end Tests | Medium | Playwright for UI flows, Trigger.dev test mode for workflow assertions. |

## Production Considerations

### Self-Hosted Deployment

Assuming that the production deployment is fully self-hosted. All components run on internal infrastructure — no data leaves the network.

| Component | Self-Hosted Setup | Notes |
|-----------|------------------|-------|
| PostgreSQL | Kubernetes StatefulSet or dedicated VM | Primary data store. Standard self-hosted pattern. |
| Trigger.dev | [Self-hosted via Docker & Kubernetes](https://trigger.dev/docs/open-source-self-hosting) | Trigger.dev is open source and supports self-hosting. Runs as a set of containers (webapp, worker, database). |
| Order Ingestion API | Kubernetes Deployment | Stateless, horizontally scalable. Could also run serverless if regulations permit. |
| Order Management API | Kubernetes Deployment | Stateless, horizontally scalable. |
| Web UI (Next.js) | Kubernetes Deployment | Server-side rendered, needs Node.js runtime. |
| Mock Vendor API | Not deployed in production | Replaced by real vendor API integrations. |
| Redis | Kubernetes StatefulSet or dedicated VM | Required if adding real-time UI updates. |

### What could be cloud-hosted (if regulations allow)

Some components handle no sensitive order data and could benefit from managed services:

- **Auth provider** (Auth0, Keycloak) — Identity management. Keycloak can also be self-hosted if needed. Cloud-hosted auth offloads security-critical infrastructure (password hashing, MFA, token rotation) to specialists.
- **PDF storage** (S3/MinIO) — MinIO is the self-hosted S3-compatible alternative. If cloud storage is permitted for non-PII documents, S3 reduces operational overhead.
- **CI/CD** (GitHub Actions, GitLab CI) — Build pipelines typically don't process regulated data. If the code repo is already cloud-hosted, CI/CD can be too.
- **Monitoring/APM** (Datadog, Grafana Cloud) — Metrics and logs may not contain regulated data depending on scrubbing policies. Self-hosted alternatives: Grafana + Prometheus + Loki stack.
- **Email/SMS notifications** (SendGrid, Twilio) — Technician notifications contain minimal PII (name, phone). If permitted, cloud providers are simpler. Otherwise, self-hosted SMTP + SMS gateway.

### Other production changes

- **Auth:** Replace mock middleware with OAuth 2.0 — client credentials for machine-to-machine (ingestion API), authorization code flow for operators (web UI). Self-hosted Keycloak or cloud Auth0 depending on regulatory clearance.
- **PDF storage:** Replace local file system with MinIO (self-hosted S3-compatible). The current `storage/` pattern isolates the read/write interface so this is a one-file change.
- **Database:** Add indexes on `status`, `ticketId`, and `createdAt` for query performance at scale. Connection pooling via PgBouncer.
- **API validation:** Add OpenAPI/Swagger spec generation (e.g., via NestJS or tsoa) for API documentation and client SDK generation.
- **Observability:** Structured logging (pino/winston), distributed tracing (OpenTelemetry), metrics (Prometheus + Grafana). Trigger.dev provides built-in run tracing even when self-hosted.
- **Real-time UI:** Self-hosted Redis for pub/sub event fan-out. tRPC subscriptions push to connected clients via SSE.
- **Rate limiting:** Nginx or Kong (self-hosted API gateway) for rate limiting external-facing endpoints. Per-IP and per-API-key throttling.
- **Testing:** E2E tests for the full workflow using Trigger.dev's test mode. Playwright for UI flows.
- **CI/CD:** Turbo's `--affected` flag to only build/test/deploy apps changed in a PR. Each app deploys independently.
- **Secrets management:** HashiCorp Vault or Kubernetes Secrets for API keys, database credentials, and Trigger.dev tokens. No secrets in environment files.

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
