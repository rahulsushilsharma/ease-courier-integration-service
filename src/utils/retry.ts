import { config } from "../config";

// Retries fn on network/5xx-style failures with exponential backoff.
// 4xx (client/validation) errors should NOT be retried — caller marks
// them non-retryable by throwing a NonRetryableError.
export class NonRetryableError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { count?: number; baseMs?: number } = {}
): Promise<T> {
  const count = opts.count ?? config.retry.count;
  const baseMs = opts.baseMs ?? config.retry.baseMs;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= count; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (err instanceof NonRetryableError || attempt === count) break;
      await sleep(baseMs * 2 ** attempt);
    }
  }
  throw lastErr;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
