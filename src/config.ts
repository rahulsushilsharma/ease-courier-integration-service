import "dotenv/config";

function num(name: string, fallback: number): number {
  const v = process.env[name];
  return v ? Number(v) : fallback;
}

export const config = {
  port: num("PORT", 3000),
  dbPath: process.env.DB_PATH || "./data/app.db",
  retry: {
    count: num("COURIER_RETRY_COUNT", 3),
    baseMs: num("COURIER_RETRY_BASE_MS", 300),
    timeoutMs: num("COURIER_TIMEOUT_MS", 8000),
  },
  bulkConcurrency: num("BULK_CONCURRENCY", 10),
  couriers: {
    urbanebolt: {
      baseUrl: process.env.URBANEBOLT_BASE_URL || "",
      apiKey: process.env.URBANEBOLT_API_KEY || "",
      apiSecret: process.env.URBANEBOLT_API_SECRET || "",
    },
  },
};
