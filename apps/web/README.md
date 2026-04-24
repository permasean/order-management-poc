# Order Management Web UI

Operator dashboard for viewing and managing dispatch orders. Built with Next.js, Tailwind CSS, and shadcn/ui.

## Setup

See the [project README](../../README.md#quick-start) for full setup instructions.

The app runs on `http://localhost:3000`.

## Views

### List View (`/`)

- Table of all orders with OrderId, TicketId, SiteAddress, DispatchType, Status, ScheduledDateTime
- Status displayed as colored badges
- Filterable by status via dropdown
- Click a row to navigate to the detail view

### Detail View (`/orders/[id]`)

- All order fields displayed
- Current status with colored badge
- Workflow history with timestamps and metadata tags (triggered by, step, VON, retry count, errors)
- **Manual Review form** (visible when status is `MANUAL_REVIEW`) — retry, reassign to different vendor, or cancel
- **Closeout form** (visible when status is `CONFIRMED`) — submit closeout notes to complete the order
- **Work Order PDF download** (visible when technician is assigned) — generates and caches a PDF with order details and tech info
- **Cancel button** (visible for non-terminal statuses)

## Server Actions

The web app uses Next.js server actions for mutations:

- `closeoutOrder` — Transitions order to `COMPLETED` with closeout notes
- `cancelOrder` — Transitions order to `CANCELED`
- `reviewOrder` — Calls the Order Management API to submit a review decision
- `downloadWorkOrderPdf` — Generates PDF on first request, caches to local storage, returns base64 for download

Closeout and cancel write directly to the database via `transitionOrder()`. Review decisions go through the management API because they need to signal the Temporal workflow.

## Environment Variables

| Variable             | Description                                      |
|----------------------|--------------------------------------------------|
| `DATABASE_URL`       | PostgreSQL connection string                     |
| `MANAGEMENT_API_URL` | Order Management API URL (default: http://localhost:3004) |

## Project Structure

```
app/
  page.tsx                   # List view (server component)
  orders/[id]/
    page.tsx                 # Detail view (server component)
    actions.ts               # Server actions (closeout, cancel, review)
components/
  cancel-button.tsx          # Cancel order button
  closeout-form.tsx          # Closeout notes form
  orders-table.tsx           # Orders list table
  review-form.tsx            # Manual review decision form
  status-badge.tsx           # Colored status badge
  status-filter.tsx          # Status dropdown filter
  work-order-download.tsx    # Work order PDF download button
  ui/                        # shadcn/ui components
lib/
  generate-work-order.ts     # PDF generation with pdfkit
  order-utils.ts             # Status colors, formatting, error display
  utils.ts                   # shadcn utility (cn)
storage/
  work-orders/               # Generated PDFs (gitignored)
```
