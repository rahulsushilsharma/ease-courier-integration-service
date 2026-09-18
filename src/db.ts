import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";
import { config } from "./config";

const dir = path.dirname(config.dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const raw = new DatabaseSync(config.dbPath);
raw.exec("PRAGMA journal_mode = WAL");

// thin wrapper matching the small subset of better-sqlite3's API we use,
// so the rest of the codebase reads the same regardless of driver.
export const db = {
  exec: (sql: string) => raw.exec(sql),
  prepare: (sql: string) => raw.prepare(sql),
};

db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  courier_partner TEXT NOT NULL,
  courier_order_id TEXT,
  awb_number TEXT,
  status TEXT NOT NULL,
  request_payload TEXT,
  response_payload TEXT,
  last_error TEXT,
  batch_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tracking_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  status TEXT NOT NULL,
  raw_payload TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS batches (
  batch_id TEXT PRIMARY KEY,
  total INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
`);
