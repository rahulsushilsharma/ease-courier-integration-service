import { db } from "../db";
import { getCourier } from "../couriers/registry";
import { CreateOrderRequest, TrackResult, CancelResult } from "../types";
import { AppError, NotFoundError, CourierApiError } from "../errors";
import { logError } from "../utils/logger";

function now() {
  return new Date().toISOString();
}

interface OrderRow {
  order_id: string;
  courier_partner: string;
  courier_order_id: string | null;
  awb_number: string | null;
  status: string;
  request_payload: string | null;
  response_payload: string | null;
  last_error: string | null;
  batch_id: string | null;
  created_at: string;
  updated_at: string;
}

export function getOrder(order_id: string): OrderRow | undefined {
  return db.prepare("SELECT * FROM orders WHERE order_id = ?").get(order_id) as OrderRow | undefined;
}

function insertPending(req: CreateOrderRequest, batch_id: string | null) {
  db.prepare(
    `INSERT INTO orders (order_id, courier_partner, status, request_payload, batch_id, created_at, updated_at)
     VALUES (@order_id, @courier_partner, 'PENDING', @request_payload, @batch_id, @now, @now)`
  ).run({
    order_id: req.order_id,
    courier_partner: req.courier_partner,
    request_payload: JSON.stringify(req),
    batch_id,
    now: now(),
  });
}

function markResult(order_id: string, fields: Partial<OrderRow>) {
  const current = getOrder(order_id);
  if (!current) return;
  const merged = { ...current, ...fields, updated_at: now() };
  db.prepare(
    `UPDATE orders SET courier_order_id=@courier_order_id, awb_number=@awb_number, status=@status,
     response_payload=@response_payload, last_error=@last_error, updated_at=@updated_at WHERE order_id=@order_id`
  ).run({
    courier_order_id: merged.courier_order_id ?? null,
    awb_number: merged.awb_number ?? null,
    status: merged.status,
    response_payload: merged.response_payload ?? null,
    last_error: merged.last_error ?? null,
    updated_at: merged.updated_at,
    order_id: merged.order_id,
  });
}

function appendHistory(order_id: string, status: string, raw?: unknown) {
  db.prepare(
    `INSERT INTO tracking_history (order_id, status, raw_payload, created_at) VALUES (?, ?, ?, ?)`
  ).run(order_id, status, raw ? JSON.stringify(raw) : null, now());
}

// Idempotent: if order_id already exists, returns its current state instead
// of calling the courier again.
export async function createOrder(req: CreateOrderRequest, batch_id: string | null = null) {
  const existing = getOrder(req.order_id);
  if (existing) return existing;

  insertPending(req, batch_id);
  const courier = getCourier(req.courier_partner);

  try {
    const result = await courier.createOrder(req);
    markResult(req.order_id, {
      courier_order_id: result.courier_order_id,
      awb_number: result.awb_number,
      status: result.status,
      response_payload: JSON.stringify(result),
      last_error: null,
    } as Partial<OrderRow>);
    appendHistory(req.order_id, result.status, result);
    return getOrder(req.order_id);
  } catch (err) {
    const appErr = err instanceof AppError ? err : new CourierApiError(String(err));
    markResult(req.order_id, { status: "FAILED", last_error: appErr.message } as Partial<OrderRow>);
    appendHistory(req.order_id, "FAILED", { error: appErr.message });
    logError({
      order_id: req.order_id,
      courier_partner: req.courier_partner,
      error_type: appErr.code,
      message: appErr.message,
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw appErr;
  }
}

export async function trackOrder(order_id: string): Promise<TrackResult> {
  const order = getOrder(order_id);
  if (!order) throw new NotFoundError(`Order ${order_id} not found`);
  if (!order.courier_order_id) {
    return { order_id, courier_partner: order.courier_partner, awb_number: null, status: order.status as any, history: [] };
  }

  const courier = getCourier(order.courier_partner);
  const result = await courier.track(order_id, order.courier_order_id);

  if (result.status !== order.status) {
    markResult(order_id, { status: result.status, awb_number: result.awb_number ?? order.awb_number } as Partial<OrderRow>);
    appendHistory(order_id, result.status, result);
  }

  const historyRows = db
    .prepare("SELECT status, raw_payload, created_at FROM tracking_history WHERE order_id = ? ORDER BY id ASC")
    .all(order_id) as { status: string; raw_payload: string | null; created_at: string }[];

  return {
    order_id,
    courier_partner: order.courier_partner,
    awb_number: result.awb_number ?? order.awb_number,
    status: result.status,
    history: historyRows.map((h) => ({
      status: h.status,
      timestamp: h.created_at,
      raw: h.raw_payload ? JSON.parse(h.raw_payload) : undefined,
    })),
  };
}

export async function cancelOrder(order_id: string): Promise<CancelResult> {
  const order = getOrder(order_id);
  if (!order) throw new NotFoundError(`Order ${order_id} not found`);
  if (!order.courier_order_id) throw new AppError(409, "CANNOT_CANCEL", "Order has no courier shipment to cancel");

  const courier = getCourier(order.courier_partner);
  const result = await courier.cancel(order_id, order.courier_order_id);
  markResult(order_id, { status: result.status } as Partial<OrderRow>);
  appendHistory(order_id, result.status);
  return result;
}
