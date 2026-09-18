# Courier Integration Service

Courier-agnostic REST API for creating, tracking, and cancelling shipments
across multiple courier partners (UrbaneBolt live, MockCourier as a second
plug-in proving the design). Consumers call one unified API and pass a
`courier_partner` field — they never see courier-specific payloads.

## Stack

Node.js + TypeScript + Express. Persistence via `node:sqlite` (Node's
built-in SQLite driver — no native build step, no DB server to run).
Validation via `zod`.

## Setup

```bash
npm install
cp .env.example .env   # fill in real UrbaneBolt UAT credentials
npm run dev             # starts on :3000 (or PORT from .env)
```

Requires Node 22+ (uses `node:sqlite`). `node:sqlite` is experimental and
prints a one-line warning on boot — safe to ignore, or replace with
`better-sqlite3` if your environment has native build tools and you want to
drop the warning (see `src/db.ts`; it's the only file that would change).

## Environment variables

See `.env.example`:

| Var | Purpose |
|---|---|
| `PORT` | HTTP port |
| `DB_PATH` | SQLite file path |
| `COURIER_RETRY_COUNT` / `COURIER_RETRY_BASE_MS` | retry/backoff for courier calls |
| `COURIER_TIMEOUT_MS` | per-request timeout to courier APIs |
| `BULK_CONCURRENCY` | max concurrent courier calls during bulk processing |
| `URBANEBOLT_BASE_URL` / `URBANEBOLT_API_KEY` / `URBANEBOLT_API_SECRET` | UrbaneBolt UAT credentials |

## Run

```bash
npm run build && npm start   # production
npm run dev                  # dev, auto-reload
```

## Test

```bash
npm test
```

Assert-based self-check (`src/tests/run.ts`) against `MockCourier` — no
network calls, no test framework. Covers: create, idempotent re-create,
track, cancel, unknown-courier error, and concurrent bulk processing.

## API

All endpoints under `/api/v1`. See `curl-examples.sh` / `postman_collection.json`.

- `POST /orders` — create a shipment
- `GET /orders/:order_id/track` — current status + full history
- `POST /orders/:order_id/cancel` — cancel a shipment
- `POST /orders/bulk` — create up to 100 orders, returns `batch_id` immediately
- `GET /orders/bulk/:batch_id` — poll batch progress + per-order results

Request/response bodies and the error shape are documented in `DESIGN.md`.

## Adding a new courier

1. Create `src/couriers/<Name>Adapter.ts` implementing `CourierAdapter`
   (`createOrder`, `track`, `cancel` — see `CourierAdapter.ts`).
2. Map that courier's raw status strings to the unified `ShipmentStatus`
   enum inside the adapter.
3. Register it in `src/couriers/registry.ts` (one line).

Nothing else changes: no controller, no DTO, no service-layer edit. See
`MockCourierAdapter.ts` for a working example with zero external calls.

## Assumptions

- The linked UrbaneBolt UAT Postman doc renders via JS and could not be
  scraped headlessly in this environment, so `UrbaneBoltAdapter.ts` implements
  the standard flow described in the assignment (login → bearer token →
  create/track/cancel shipment) against placeholder endpoint paths. Swap the
  paths/field names in that one file once real docs are available — no other
  file needs to change, which is the point of the adapter boundary.
- Idempotency key is the caller-supplied `order_id` (primary key in `orders`);
  a second `createOrder` call with the same `order_id` returns the existing
  row without re-calling the courier.
- Bulk processing is in-process (bounded concurrency, no external queue) —
  see trade-off note in `src/services/bulkService.ts` and `DESIGN.md`.
