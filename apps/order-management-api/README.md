# Order Management API

Internal API for operator actions on dispatch orders. Handles manual review decisions by sending Temporal signals to resume paused workflows. Built with Express.

## Setup

See the [project README](../../README.md#quick-start) for full setup instructions.

The API runs on `http://localhost:3004`.

## API Endpoints

### `GET /health`

Health check.

**Response:** `200`
```json
{ "status": "ok" }
```

### `POST /orders/:id/review`

Submit a manual review decision for an order in `MANUAL_REVIEW` status. Sends a signal to the Temporal workflow, resuming it.

**Request body:**

| Field     | Type   | Required | Description                                          |
|-----------|--------|----------|------------------------------------------------------|
| action    | string | yes      | One of: `retry`, `reassign`, `cancel`                |
| newVendor | string | conditional | Required when action is `reassign`               |

**Actions:**
- `retry` — Retry the vendor API call with the same vendor
- `reassign` — Retry with a different vendor (provide `newVendor`)
- `cancel` — Cancel the order

**Success response:** `200`
```json
{ "message": "Review decision submitted", "orderId": "...", "action": "retry" }
```

**Error responses:**
- `400` — Validation failed
- `404` — Order not found
- `409` — Order is not in `MANUAL_REVIEW` status, or decision already submitted

## Environment Variables

| Variable           | Description                          |
|--------------------|--------------------------------------|
| `PORT`             | Server port (default: 3004)          |
| `DATABASE_URL`     | PostgreSQL connection string         |
| `TEMPORAL_ADDRESS` | Temporal server address (default: localhost:7233) |

## Project Structure

```
src/
  server.ts                    # Entry point (loads dotenv)
  app.ts                       # Express app setup
  routes/review.ts             # Review decision route
  controllers/review.ts        # Review decision logic + workflow signaling
  validation/reviewSchema.ts   # Zod schema for review input
  middleware/errorHandler.ts    # Centralized error handler
```
