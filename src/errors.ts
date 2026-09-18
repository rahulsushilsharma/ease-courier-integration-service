export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown) {
    super(400, "VALIDATION_ERROR", "Request failed validation", details);
  }
}

export class UnknownCourierError extends AppError {
  constructor(courier: string, supported: string[]) {
    super(400, "UNKNOWN_COURIER", `Unsupported courier_partner: ${courier}`, {
      supported_couriers: supported,
    });
  }
}

export class CourierApiError extends AppError {
  constructor(message: string, public raw?: unknown) {
    super(502, "COURIER_API_ERROR", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, "NOT_FOUND", message);
  }
}
