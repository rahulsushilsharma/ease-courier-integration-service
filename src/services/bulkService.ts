import { nanoid } from "nanoid";
import { db } from "../db";
import { config } from "../config";
import { createOrder, getOrder } from "./orderService";
import { BulkOrderItem, BulkItemResult } from "../types";
import { AppError } from "../errors";

// Design choice: return batch_id immediately, process in background with a
// bounded concurrency pool (no queue infra needed at 100-order scale).
// Trade-off: batch state lives in-process — a process restart mid-batch
// loses in-flight orders' "processing" status (rows already written are
// safe; add a durable job queue like BullMQ if this needs to survive
// restarts / scale across workers).
export function startBulk(items: BulkOrderItem[]): string {
  const batch_id = nanoid();
  db.prepare("INSERT INTO batches (batch_id, total, created_at) VALUES (?, ?, ?)").run(
    batch_id,
    items.length,
    new Date().toISOString()
  );
  processBulk(batch_id, items).catch(() => {}); // errors handled per-item inside
  return batch_id;
}

async function processBulk(batch_id: string, items: BulkOrderItem[]) {
  const limit = config.bulkConcurrency;
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const item = items[index++];
      try {
        await createOrder(item, batch_id);
      } catch {
        // createOrder already persisted the FAILED state + logged it.
      } finally {
        db.prepare("UPDATE batches SET completed = completed + 1 WHERE batch_id = ?").run(batch_id);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export function getBatchStatus(batch_id: string) {
  const batch = db.prepare("SELECT * FROM batches WHERE batch_id = ?").get(batch_id) as
    | { batch_id: string; total: number; completed: number; created_at: string }
    | undefined;
  if (!batch) throw new AppError(404, "NOT_FOUND", `Batch ${batch_id} not found`);

  const rows = db.prepare("SELECT * FROM orders WHERE batch_id = ?").all(batch_id) as any[];
  const results: BulkItemResult[] = rows.map((r) => ({
    order_id: r.order_id,
    success: r.status !== "FAILED",
    status: r.status,
    awb_number: r.awb_number ?? undefined,
    error: r.status === "FAILED" ? { code: "COURIER_API_ERROR", message: r.last_error } : undefined,
  }));

  return {
    batch_id,
    total: batch.total,
    completed: batch.completed,
    done: batch.completed >= batch.total,
    results,
  };
}
