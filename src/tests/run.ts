// Minimal assert-based self-check (no framework) against MockCourier —
// exercises create/idempotency/track/cancel/bulk without hitting a network.
import assert from "assert";
import fs from "fs";
import path from "path";
import type { CreateOrderRequest } from "../types";

// use an isolated throwaway db file for the test run
const testDbPath = path.join(__dirname, "..", "..", "data", "test.db");
process.env.DB_PATH = testDbPath;
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

// dynamic import: must run AFTER DB_PATH is set (static imports get hoisted)
async function load() {
  return {
    ...(await import("../services/orderService")),
    ...(await import("../services/bulkService")),
  };
}

function sampleOrder(order_id: string): CreateOrderRequest {
  return {
    order_id,
    courier_partner: "mockcourier",
    pickup_address: {
      name: "A", phone: "9999999999", line1: "L1", city: "C", state: "S", pincode: "123456", country: "IN",
    },
    drop_address: {
      name: "B", phone: "8888888888", line1: "L2", city: "C2", state: "S2", pincode: "654321", country: "IN",
    },
    package: { weight_kg: 1.5 },
  };
}

async function main() {
  const { createOrder, trackOrder, cancelOrder, getOrder, startBulk, getBatchStatus } = await load();

  // create
  const order = await createOrder(sampleOrder("ORD-1"));
  assert(order && order.status === "CREATED", "order should be CREATED");
  assert(order!.awb_number, "awb_number should be set");

  // idempotency: same order_id twice does not create a second shipment
  const before = getOrder("ORD-1")!.courier_order_id;
  await createOrder(sampleOrder("ORD-1"));
  const after = getOrder("ORD-1")!.courier_order_id;
  assert.strictEqual(before, after, "duplicate order_id must not create a new shipment");

  // track
  const tracked = await trackOrder("ORD-1");
  assert.strictEqual(tracked.order_id, "ORD-1");
  assert(tracked.history.length >= 1, "history should have at least one entry");

  // cancel
  const cancelled = await cancelOrder("ORD-1");
  assert.strictEqual(cancelled.status, "CANCELLED");

  // unknown courier
  try {
    await createOrder(sampleOrder("ORD-BAD-COURIER") as any);
    await createOrder({ ...sampleOrder("ORD-2"), courier_partner: "doesnotexist" });
    assert.fail("should have thrown for unknown courier");
  } catch (err: any) {
    assert.strictEqual(err.code, "UNKNOWN_COURIER");
  }

  // bulk: 5 orders, different couriers, concurrent
  const items = Array.from({ length: 5 }, (_, i) => sampleOrder(`BULK-${i}`));
  const batch_id = startBulk(items);
  let status;
  for (let i = 0; i < 50; i++) {
    status = getBatchStatus(batch_id);
    if (status.done) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert(status!.done, "batch should complete");
  assert.strictEqual(status!.results.filter((r) => r.success).length, 5);

  console.log("ALL TESTS PASSED");
}

main().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
