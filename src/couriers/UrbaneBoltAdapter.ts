import { CourierAdapter } from "./CourierAdapter";
import { CreateOrderRequest, CreateOrderResult, TrackResult, CancelResult, ShipmentStatus } from "../types";
import { config } from "../config";
import { withRetry, NonRetryableError } from "../utils/retry";
import { CourierApiError } from "../errors";

// NOTE: exact UrbaneBolt UAT endpoint paths/fields could not be pulled from
// the linked Postman doc (JS-rendered, not fetchable headlessly). This
// adapter follows the standard shape described in task.md (auth, create
// shipment, track, cancel) and isolates the courier's actual wire format
// behind fetch calls below — swap the paths/fields here once real docs are
// in hand; nothing outside this file changes.

const STATUS_MAP: Record<string, ShipmentStatus> = {
  order_created: "CREATED",
  picked_up: "PICKED_UP",
  in_transit: "IN_TRANSIT",
  delivered: "DELIVERED",
  cancelled: "CANCELLED",
  failed: "FAILED",
};

function mapStatus(raw: string): ShipmentStatus {
  return STATUS_MAP[raw?.toLowerCase()] ?? "FAILED";
}

export class UrbaneBoltAdapter implements CourierAdapter {
  readonly name = "urbanebolt";
  private token: string | null = null;
  private tokenExpiresAt = 0;

  private get cfg() {
    return config.couriers.urbanebolt;
  }

  private async authenticate(): Promise<string> {
    const res = await fetch(`${this.cfg.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: this.cfg.apiKey, api_secret: this.cfg.apiSecret }),
      signal: AbortSignal.timeout(config.retry.timeoutMs),
    });
    if (!res.ok) throw new NonRetryableError(`UrbaneBolt auth failed: ${res.status}`);
    const data = (await res.json()) as { token: string; expires_in: number };
    this.token = data.token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return this.token;
  }

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt - 5000) return this.token;
    return this.authenticate();
  }

  // Wraps any authenticated call: retries once on 401 after re-auth.
  private async authedCall<T>(call: (token: string) => Promise<Response>): Promise<T> {
    let token = await this.getToken();
    let res = await call(token);

    if (res.status === 401) {
      token = await this.authenticate();
      res = await call(token);
    }

    if (res.status >= 400 && res.status < 500) {
      const body = await safeJson(res);
      throw new NonRetryableError(`UrbaneBolt client error ${res.status}`, body);
    }
    if (!res.ok) {
      throw new Error(`UrbaneBolt server error ${res.status}`);
    }
    return (await res.json()) as T;
  }

  async createOrder(req: CreateOrderRequest): Promise<CreateOrderResult> {
    try {
      const data = await withRetry(() =>
        this.authedCall<any>((token) =>
          fetch(`${this.cfg.baseUrl}/shipments`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(toUrbaneBoltPayload(req)),
            signal: AbortSignal.timeout(config.retry.timeoutMs),
          })
        )
      );
      return {
        order_id: req.order_id,
        courier_partner: this.name,
        courier_order_id: data.shipment_id,
        awb_number: data.awb_number,
        status: mapStatus(data.status ?? "order_created"),
      };
    } catch (err) {
      throw toCourierApiError(err, "createOrder");
    }
  }

  async track(order_id: string, courier_order_id: string): Promise<TrackResult> {
    try {
      const data = await withRetry(() =>
        this.authedCall<any>((token) =>
          fetch(`${this.cfg.baseUrl}/shipments/${courier_order_id}/track`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(config.retry.timeoutMs),
          })
        )
      );
      return {
        order_id,
        courier_partner: this.name,
        awb_number: data.awb_number ?? null,
        status: mapStatus(data.status),
        history: (data.history ?? []).map((h: any) => ({
          status: h.status,
          timestamp: h.timestamp,
          raw: h,
        })),
      };
    } catch (err) {
      throw toCourierApiError(err, "track");
    }
  }

  async cancel(order_id: string, courier_order_id: string): Promise<CancelResult> {
    try {
      const data = await withRetry(() =>
        this.authedCall<any>((token) =>
          fetch(`${this.cfg.baseUrl}/shipments/${courier_order_id}/cancel`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(config.retry.timeoutMs),
          })
        )
      );
      return { order_id, status: mapStatus(data.status ?? "cancelled") };
    } catch (err) {
      throw toCourierApiError(err, "cancel");
    }
  }
}

function toUrbaneBoltPayload(req: CreateOrderRequest) {
  return {
    reference_id: req.order_id,
    pickup: req.pickup_address,
    drop: req.drop_address,
    package_weight: req.package.weight_kg,
    payment_mode: req.payment_mode ?? "PREPAID",
    cod_amount: req.cod_amount ?? 0,
  };
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function toCourierApiError(err: unknown, op: string): CourierApiError {
  if (err instanceof CourierApiError) return err;
  const message = err instanceof Error ? err.message : `UrbaneBolt ${op} failed`;
  return new CourierApiError(message, err);
}
