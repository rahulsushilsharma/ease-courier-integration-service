// Structured logging via console + JSON — no logging lib needed at this scale.
export function logError(fields: {
  order_id?: string;
  courier_partner?: string;
  request_id?: string;
  error_type: string;
  message: string;
  stack?: string;
}) {
  console.error(JSON.stringify({ level: "error", ts: new Date().toISOString(), ...fields }));
}

export function logInfo(fields: Record<string, unknown>) {
  console.log(JSON.stringify({ level: "info", ts: new Date().toISOString(), ...fields }));
}
