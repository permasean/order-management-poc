# Order Ingestion API

REST API for creating dispatch orders. Built with Express, Prisma, and PostgreSQL.

## Prerequisites

- Node.js >= 18
- Docker (for PostgreSQL)
- pnpm

## Setup

1. **Start PostgreSQL:**

   ```sh
   # From repo root
   docker compose up -d
   ```

2. **Install dependencies:**

   ```sh
   # From repo root
   pnpm install
   ```

3. **Run database migration:**

   ```sh
   # From packages/database
   npx prisma migrate dev
   ```

4. **Start the dev server:**

   ```sh
   # From repo root
   pnpm exec turbo dev --filter=order-ingestion-api
   ```

   The API runs on `http://localhost:3002`.

## API Endpoints

### `GET /health`

Health check. No authentication required.

**Response:** `200`
```json
{ "status": "ok" }
```

### `POST /orders`

Create a new dispatch order. Requires a Bearer token in the `Authorization` header.

**Headers:**
- `Content-Type: application/json`
- `Authorization: Bearer <token>` (any token value accepted in POC)

**Request body:**

| Field             | Type   | Required | Description                                      |
|-------------------|--------|----------|--------------------------------------------------|
| ticketId          | string | yes      | External ticket identifier                       |
| siteAddress       | string | yes      | Address for the dispatch                         |
| scheduledDateTime | string | yes      | ISO 8601 datetime                                |
| dispatchType      | string | yes      | One of: `New Install`, `Repair`, `Site Survey`   |

**Success response:** `201`
```json
{ "orderId": "a2a8aed6-f80c-4bbd-bc3b-00f1b02a61da" }
```

**Validation error response:** `400`
```json
{
  "error": "Validation failed",
  "details": {
    "ticketId": ["ticketId is required"],
    "dispatchType": ["dispatchType must be one of: New Install, Repair, Site Survey"]
  }
}
```

**Auth error response:** `401`
```json
{ "error": "Missing authorization token" }
```

### `POST /webhooks/approval`

Approval webhook that transitions an order from `Pending Approval` to `Request Sent`. Requires a Bearer token.

**Headers:**
- `Content-Type: application/json`
- `Authorization: Bearer <token>`

**Request body:**

| Field      | Type   | Required | Description                        |
|------------|--------|----------|------------------------------------|
| orderId    | string | yes      | UUID of the order to approve       |
| vendorName | string | yes      | Selected vendor for the dispatch   |

**Success response:** `200`
```json
{ "orderId": "a2a8aed6-...", "status": "REQUEST_SENT" }
```

**Error responses:**
- `400` — Validation failed (missing/malformed fields)
- `404` — Order not found
- `409` — Order is not in `Pending Approval` status

## Authentication

This POC uses a mock auth middleware that checks for the presence of a Bearer token but accepts any value. In production, this would be replaced with OAuth/JWT verification against a provider's JWKS endpoint.

## Project Structure

```
src/
  server.ts                # Entry point
  app.ts                   # Express app setup
  routes/orders.ts           # Order creation route
  routes/approvals.ts        # Approval webhook route
  controllers/orders.ts      # Order creation logic
  controllers/approvals.ts   # Approval webhook logic
  validation/orderSchema.ts  # Zod schema for order creation
  validation/approvalSchema.ts # Zod schema for approval
  middleware/auth.ts        # Mock auth middleware
  middleware/errorHandler.ts # Centralized error handler
  types/errors.ts           # AppError class
```
