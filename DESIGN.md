# Design

## Pattern: Adapter (a.k.a. Strategy) + Registry

Every courier partner implements one interface, `CourierAdapter`:

```ts
interface CourierAdapter {
  createOrder(req: CreateOrderRequest): Promise<CreateOrderResult>;
  track(order_id: string, courier_order_id: string): Promise<TrackResult>;
  cancel(order_id: string, courier_order_id: string): Promise<CancelResult>;
}
```

Controllers and `orderService` (business logic + persistence) depend only on
this interface, never on a concrete courier. A `registry.ts` maps
`courier_partner` string → adapter instance; it's the single file touched to
add a courier. This directly satisfies the constraint: adding a courier
requires no changes to routes, DTOs, or existing adapters/services.

Why Adapter over e.g. a plugin-loader/DI container: at this scale (a handful
of couriers) a map literal is the whole "plugin system" that's needed — no
config-driven dynamic loading, no dependency-injection framework. Add that
only if couriers become numerous enough or third parties need to register
their own without touching this repo.

Each adapter owns:
- Its own auth (UrbaneBolt: bearer token, cached, auto-refreshed on 401 + one retry).
- Mapping its raw status vocabulary → the unified `ShipmentStatus` enum
  (`CREATED | PICKED_UP | IN_TRANSIT | DELIVERED | CANCELLED | FAILED`).
- Its own wire format — the rest of the system never sees UrbaneBolt's JSON shape.

## Request flow

```
Controller (validates via zod, courier-agnostic DTO)
   -> orderService (idempotency check, persistence, error normalization)
        -> registry.getCourier(courier_partner)
             -> CourierAdapter.createOrder/track/cancel
```

## Database schema (SQLite, via `node:sqlite`)

`orders` — one row per order, current state:
`order_id (PK), courier_partner, courier_order_id, awb_number, status,
request_payload (JSON), response_payload (JSON), last_error, batch_id,
created_at, updated_at`.

`tracking_history` — append-only, one row per status transition:
`id, order_id, status, raw_payload (JSON), created_at`. Populated on create
and every time `track()` observes a status change.

`batches` — bulk job progress: `batch_id, total, completed, created_at`.

SQLite (not Postgres/Mongo) chosen for zero external setup — this is a
service you should be able to `npm install && npm run dev` with nothing else
running. Swapping to Postgres later only touches `src/db.ts` and the SQL in
`orderService.ts`/`bulkService.ts`; nothing about the adapter layer changes.

## Bulk processing (100 orders)

`POST /orders/bulk` returns `batch_id` immediately (202 Accepted) and
processes orders in the background with a bounded-concurrency worker pool
(`BULK_CONCURRENCY`, default 10) — not 100 sequential courier calls, not
unbounded parallelism either. `GET /orders/bulk/:batch_id` polls progress and
per-order pass/fail with reason.

**Trade-off — chosen: return-batch-id-and-poll, in-process pool.**
- Pro: zero extra infra (no Redis/queue broker), simple to reason about,
  meets "must not call courier 100x sequentially" and "stay responsive."
- Con: batch state is in-memory-driven (rows are durable, but a process
  restart mid-batch stops picking up remaining items — nothing is lost or
  double-sent thanks to the `order_id` idempotency check, but the batch won't
  auto-resume). At real production scale / multi-instance deployment, swap
  `bulkService.ts`'s worker loop for a durable queue (BullMQ + Redis, SQS,
  etc.) — the per-order call into `orderService.createOrder` doesn't change.

Idempotency: `order_id` is the SQLite primary key. `createOrder` checks for
an existing row before calling the courier; a duplicate `order_id` (within
one batch or across separate requests) short-circuits to the existing
result instead of creating a second shipment.

## Error handling

Single normalized shape from every endpoint:

```json
{ "error": { "code": "STRING_CODE", "message": "human message", "details": {...} } }
```

- Validation (zod) failures → 400 `VALIDATION_ERROR` with per-field messages.
- Unknown `courier_partner` → 400 `UNKNOWN_COURIER` + list of supported couriers.
- Courier 4xx → wrapped as `NonRetryableError`, surfaced as 502
  `COURIER_API_ERROR` with a generic message — the courier's raw error body
  is never forwarded to the client, only logged server-side.
- Courier 5xx/timeout/network → `withRetry()` retries with exponential
  backoff (`COURIER_RETRY_COUNT` / `COURIER_RETRY_BASE_MS`, both configurable),
  then the order is persisted as `FAILED` with `last_error` set for
  reconciliation.
- Courier auth expiry (401) → adapter re-authenticates once and retries the
  call transparently before surfacing any error.
- Every failure logs `order_id`, `courier_partner`, `request_id` (from
  `x-request-id` header if present), `error_type`, and stack trace (structured
  JSON via `src/utils/logger.ts`).

## Trade-offs / things deliberately left out

- No auth/authz on the unified API itself — task scope is the courier
  integration layer for internal consumers; add an API-key or JWT middleware
  in front of `router` if this is exposed beyond trusted internal callers.
- No ORM — the schema is 3 small tables; raw SQL via `node:sqlite` is less
  code and less magic than adding Prisma/TypeORM for this size.
- `node:sqlite` is Node's experimental built-in SQLite (stable enough for
  this exercise, zero native compilation). For a real production deployment,
  swap to Postgres or `better-sqlite3`, isolated to `src/db.ts`.
