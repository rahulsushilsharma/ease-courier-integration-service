import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors";
import { logError } from "../utils/logger";

// Single normalized error shape for every endpoint.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = (req.headers["x-request-id"] as string) || undefined;

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logError({
        request_id: requestId,
        error_type: err.code,
        message: err.message,
        stack: err.stack,
      });
    }
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details ?? null },
    });
  }

  const message = err instanceof Error ? err.message : "Internal server error";
  logError({ request_id: requestId, error_type: "INTERNAL_ERROR", message, stack: (err as Error)?.stack });
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error", details: null } });
}
