# Mock Vendor API

Simulates an external vendor dispatch API for testing the workflow. Built with Express.

## Setup

See the [project README](../../README.md#quick-start) for full setup instructions.

The API runs on `http://localhost:3003`.

## API Endpoints

### `POST /dispatch`

Submit a dispatch request. Returns a vendor order number (VON).

**Request body:**

| Field        | Type   | Description                |
|--------------|--------|----------------------------|
| orderId      | string | Order identifier           |
| dispatchType | string | Type of dispatch           |
| siteAddress  | string | Site address for dispatch  |

**Response:** `201`
```json
{ "vendorOrderNumber": "VON-A1B2C3D4" }
```

### `GET /dispatch/:vendorOrderNumber`

Check technician assignment status. Returns `pending` for the first few polls, then `assigned` with technician details.

**Response (pending):**
```json
{ "status": "pending", "vendorOrderNumber": "VON-A1B2C3D4" }
```

**Response (assigned — after 3 polls):**
```json
{
  "status": "assigned",
  "vendorOrderNumber": "VON-A1B2C3D4",
  "techFirstName": "John",
  "techLastName": "Smith",
  "techMobilePhone": "555-0123"
}
```

## Behavior

The mock API simulates realistic vendor behavior:
- Dispatch requests always succeed and return a generated VON
- Tech assignment polling returns `pending` for the first 2 checks, then `assigned` on the 3rd

To test failure scenarios, stop this service before approving an order. The workflow will retry the vendor API call, exhaust retries, and enter manual review.

## Project Structure

```
src/
  server.ts              # Entry point
  app.ts                 # Express app setup
  routes/vendor.ts       # Dispatch routes
  controllers/vendor.ts  # Mock dispatch logic
```
