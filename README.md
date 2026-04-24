# Order Management POC

A dispatch order management system built as a Turborepo monorepo. Demonstrates durable workflow orchestration using Temporal, with human-in-the-loop (HITL) patterns, automatic retries, and long-running polling — all within a single resumable workflow.

## Architecture

```
External System ----> Order Ingestion API (3002) ----> Workflow Engine (Temporal)
                                                             |
                                                             |  calls
                                                             v
Web UI (3000) ----------> Order Management API (3004)   Mock Vendor API (3003)
                          (signals workflows)
```

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Monorepo | Turborepo + pnpm workspaces | Shared database package across apps, single `pnpm exec turbo dev` to start everything, independent deployability per app |
| Workflow engine | Temporal | Durable execution with signals and `condition()` eliminates custom state machines, outbox tables, and recovery logic. Workflows checkpoint at activity calls, sleeps, and conditions, and resume without holding resources |
| Database | PostgreSQL + Prisma | Type-safe ORM, automatic migrations, shared schema across all apps via `@repo/database` |
| API framework | Express | Lightweight, well-documented, sufficient for a POC. Fastify or NestJS would be better for production (built-in validation, OpenAPI) |
| Frontend | Next.js + server components | Direct Prisma queries in page components, server actions for mutations, no API layer needed for reads |
| Auth | Mock middleware | Checks for Bearer token presence but accepts any value. Documents where OAuth/JWT validation would go in production |
| PDF | pdfkit (server-side) | Pure Node.js, no browser dependencies, generates on-demand and caches to local storage |
| Separate ingestion vs management API | Two Express apps | Ingestion API is external-facing (could be serverless), management API signals Temporal workflows. Different security boundaries, different scaling characteristics |

### Why Temporal over cron jobs?

Cron jobs are stateless — they have no memory of prior runs. This workflow spans hours or days (waiting for human approval, polling vendor APIs). Temporal saves execution state via event sourcing and frees the worker. When a signal arrives or a timer expires, a worker replays the event history to reconstruct state and resumes execution. This allows long-running workflows without holding resources.

### Signals (Temporal)

Temporal signals are the mechanism for external systems to communicate with running workflows. A signal delivers data to a workflow, which can then act on it. Signals are durable — if the workflow isn't currently being processed by a worker, the signal is buffered and delivered when the workflow resumes.

In this project, we use signals for:
- **Approval** — ingestion API signals the workflow with vendor info, resuming it from the approval wait
- **Manual review** — management API signals the workflow with an operator's decision (retry, reassign, or cancel)

The workflow waits for signals using `condition()`, which blocks until the signal handler sets a local variable, or until a timeout expires.

### Idempotency

Temporal uses workflow IDs for idempotency. Starting a workflow with the same ID as a running workflow is rejected — no duplicate workflows are created. This project uses `order-lifecycle:<orderId>` as the workflow ID, ensuring one workflow per order.

### Key Patterns

- **HITL (Human-in-the-Loop):** Approval and manual review use signals + `condition()` to pause the workflow for human decisions.
- **Retry with backoff:** Vendor API calls are wrapped in a Temporal activity with a retry policy (3 attempts, exponential backoff). Temporal handles the retry loop automatically.
- **Durable polling:** Tech assignment polling uses `sleep()` to pause the workflow between polls — the worker is freed and state is saved via event history. When the timer expires, a worker replays history and resumes execution.
- **Centralized audit trail:** All status transitions go through `transitionOrder()` which atomically records history with metadata.
- **Orphan reconciler:** A scheduled Temporal workflow that scans for orders stuck in `PENDING_APPROVAL` without an active workflow. This handles the edge case where the API server crashes between creating the order in the database and starting the workflow — the order would be orphaned with no workflow processing it. The reconciler starts the workflow with the same workflow ID, so duplicates are impossible.

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
| Order creation | API crashes after DB write but before `workflow.start()` | Orphan reconciler detects the stuck order and starts the workflow |
| Order creation | `workflow.start()` called twice | Temporal rejects duplicate workflow ID |
| Approval webhook | External system sends duplicate approval | Idempotent — returns 200 if already approved |
| Approval wait | No approval received within timeout | Workflow transitions order to `FAILED` |
| Vendor API call | API unreachable or returns error | Activity retry policy: 3 attempts with exponential backoff |
| Vendor API call | All retries exhausted | Order transitions to `MANUAL_REVIEW` for operator intervention |
| Manual review | Operator submits duplicate decision | Signal to completed workflow — returns 409 |
| Manual review | 3 review cycles exhausted (vendor keeps failing) | Order transitions to `FAILED` |
| Manual review | No operator action within 7 days | Condition times out → order transitions to `FAILED` |
| Tech polling | Order canceled via UI during polling | Detected on next poll cycle, workflow exits cleanly |
| Tech polling | Max polls exceeded | Order transitions to `MANUAL_REVIEW` |
| Status transitions | Invalid transition attempted | Rejected by `transitionOrder()` validation |

### How an order reaches `FAILED`

`FAILED` is a terminal status introduced beyond the original scope for unrecoverable workflow failures — distinct from `CANCELED` (intentional operator action):

1. **Approval timeout** — No one approved the order within the configured window (10 minutes in POC)
2. **Max review attempts exceeded** — The vendor API failed, operators retried 3 times through manual review, and it still failed
3. **Review timeout** — Order entered `MANUAL_REVIEW` but no operator acted within 7 days

## What Was Added Beyond Scope

The following were added beyond the original requirements:

- **`FAILED` status:** Not in the original spec. Added as a terminal status for unrecoverable workflow failures (approval timeout, max review attempts exceeded). Distinguishes between intentional cancellation (`CANCELED` — operator action) and system-level failure (`FAILED` — no human intervention possible within the allowed window).
- **`MANUAL_REVIEW` status:** The spec required routing to a "human exception queue" after vendor API retries are exhausted. We implemented this as a first-class workflow state with a dedicated UI, allowing operators to retry, reassign to a different vendor, or cancel — all while the workflow remains paused via `condition()`.
- **Orphan reconciler:** Safety net for orders where the API server crashes between database write and workflow start.
- **Idempotency:** Duplicate-safe workflow starts via Temporal's workflow ID uniqueness guarantee.

## Apps

| App | Description | Port | Docs |
|-----|-------------|------|------|
| [order-ingestion-api](apps/order-ingestion-api/) | External-facing API for creating orders and receiving approval webhooks | 3002 | [README](apps/order-ingestion-api/README.md) |
| [order-management-api](apps/order-management-api/) | Internal API for operator actions (manual review decisions) | 3004 | [README](apps/order-management-api/README.md) |
| [web](apps/web/) | Operator dashboard for viewing and managing orders | 3000 | [README](apps/web/README.md) |
| [workflow-engine](apps/workflow-engine/) | Temporal workflows and activities for the order lifecycle | — | [README](apps/workflow-engine/README.md) |
| [mock-vendor-api](apps/mock-vendor-api/) | Simulates a vendor dispatch API for testing | 3003 | [README](apps/mock-vendor-api/README.md) |

## Shared Packages

| Package | Description |
|---------|-------------|
| `@repo/database` | Prisma schema, client, and shared transition logic |
| `@repo/config` | Centralized workflow configuration — signal names, timeouts, retry counts, poll intervals, task queue name. Single source of truth across all apps |

## Quick Start

### Prerequisites

- Node.js >= 18
- Docker (for PostgreSQL and Temporal)
- pnpm

### Setup

1. **Install pnpm** (if not already installed):

   ```sh
   npm install -g pnpm@9
   ```

2. **Install dependencies:**

   ```sh
   pnpm install
   ```

3. **Start PostgreSQL and Temporal:**

   ```sh
   docker compose up -d
   ```

   This starts PostgreSQL, Temporal server, and Temporal UI (accessible at http://localhost:8080).

4. **Run database migrations:**

   ```sh
   cd packages/database && npx prisma migrate dev
   ```

5. **Set up environment variables:**

   Copy `.env.example` to `.env` in each app that has one:

   ```sh
   cp apps/order-ingestion-api/.env.example apps/order-ingestion-api/.env
   cp apps/order-management-api/.env.example apps/order-management-api/.env
   cp packages/database/.env.example packages/database/.env
   ```

   Update `DATABASE_URL` if needed — default is `postgresql://postgres:postgres@localhost:5432/order_management`.

6. **Set up Temporal schedules** (one-time):

   ```sh
   pnpm --filter workflow-engine run setup-schedules
   ```

7. **Run tests:**

   ```sh
   pnpm test
   ```

   All tests are unit tests with mocked dependencies — no database or external services required.

8. **Start all services:**

   ```sh
   pnpm exec turbo dev
   ```

   This starts all apps including the Temporal worker.

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

You can also monitor workflow progress in the Temporal UI at http://localhost:8080.

### 4. Download work order PDF

Once the order is `CONFIRMED`, open the detail view and click "Download Work Order". A PDF is generated with order details and technician info, saved to local storage, and downloaded. Subsequent clicks return the cached PDF.

### 5. Close out the order

Open `http://localhost:3000`, click on the order, fill in closeout notes, and submit.

### 6. Test manual review

Stop the mock vendor API, create and approve a new order. After vendor API retries are exhausted, the order enters `MANUAL_REVIEW`. Use the review form in the web UI to retry, reassign to a different vendor, or cancel.

## What's Included vs. Not Yet Implemented

### Included

- Order Ingestion API (create order, validation, mock auth)
- Approval Webhook (status transition, idempotent)
- Vendor API Integration (retry with backoff)
- Technician Polling (durable, cancel-aware)
- Job Closeout (notes, timestamp, status transition)
- Manual Review / Exception Queue (retry, reassign, cancel)
- Audit Trail (every transition with metadata)
- Web UI — List View (table, status badges, filtering)
- Web UI — Detail View (all fields, workflow history, metadata tags)
- Work Order PDF (on-demand generation, cached)
- Orphan Reconciler (safety net for stuck orders)
- Failure Handling (comprehensive, documented)

### To Implement Further

| Feature | Approach |
|---------|----------|
| Technician Notification (SMS/email on CONFIRMED) | Add an activity that calls SendGrid/Twilio after the CONFIRMED transition in the workflow. |
| AI-Assisted Closeout Summary | Vercel AI SDK (`ai` package) for model-agnostic LLM calls. After closeout submission, generate a structured summary (work performed, issues found, materials used). Store on the order, display in detail view. |
| OpenAPI/Swagger Compliance | Add `tsoa` or `swagger-jsdoc` to Express apps for auto-generated API specs. Or migrate to NestJS for built-in OpenAPI support. |
| Real-time Dashboard | Redis pub/sub for event fan-out, tRPC subscriptions with SSE for live updates. Workflow activities publish to Redis after status changes, web app subscribes. |
| API Integration Tests | Supertest for API endpoint testing against a test database (separate Postgres instance or Testcontainers). |
| End-to-end Tests | Playwright for UI flows, Temporal test framework for workflow assertions. |

## Production Considerations

These are several core considerations, not an exhaustive list.


### Self-Hosted Deployment

Assuming that the production deployment is fully self-hosted. All components run on internal infrastructure — no data leaves the network.

| Component | Self-Hosted Setup | Notes |
|-----------|------------------|-------|
| PostgreSQL | Kubernetes StatefulSet or dedicated VM | Primary data store. Standard self-hosted pattern. |
| Temporal | [Self-hosted via Docker & Kubernetes](https://docs.temporal.io/self-hosted-guide) | Temporal server + Temporal UI. Requires its own database (can share the PostgreSQL instance or use a separate one). |
| Order Ingestion API | Kubernetes Deployment | Stateless, horizontally scalable. Could also run serverless if regulations permit. |
| Order Management API | Kubernetes Deployment | Stateless, horizontally scalable. |
| Workflow Engine (Worker) | Kubernetes Deployment | Stateless Temporal worker. Scale horizontally by adding replicas — Temporal distributes work across workers polling the same task queue. |
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
- **Observability:** Structured logging (pino/winston), distributed tracing (OpenTelemetry), metrics (Prometheus + Grafana). Temporal provides built-in workflow tracing and visibility.
- **Real-time UI:** Self-hosted Redis for pub/sub event fan-out. tRPC subscriptions push to connected clients via SSE.
- **Rate limiting:** Nginx or Kong (self-hosted API gateway) for rate limiting external-facing endpoints. Per-IP and per-API-key throttling.
- **Testing:** E2E tests for the full workflow using Temporal's test framework. Playwright for UI flows.
- **CI/CD:** Turbo's `--affected` flag to only build/test/deploy apps changed in a PR. Each app deploys independently.
- **Secrets management:** HashiCorp Vault or Kubernetes Secrets for API keys, database credentials. No secrets in environment files.

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
