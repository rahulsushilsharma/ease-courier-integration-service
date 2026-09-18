import { CourierAdapter } from "./CourierAdapter";
import { CreateOrderRequest, CreateOrderResult, TrackResult, CancelResult } from "../types";
import { nanoid } from "nanoid";

// Second courier with zero external calls — proves adding a courier needs
// no changes to controllers/services/DTOs. Register it in registry.ts only.
export class MockCourierAdapter implements CourierAdapter {
  readonly name = "mockcourier";
  private shipments = new Map<string, { awb: string; status: string }>();

  async createOrder(req: CreateOrderRequest): Promise<CreateOrderResult> {
    const courier_order_id = `MOCK-${nanoid(8)}`;
    const awb_number = `MAWB${nanoid(10).toUpperCase()}`;
    this.shipments.set(courier_order_id, { awb: awb_number, status: "CREATED" });
    return { order_id: req.order_id, courier_partner: this.name, courier_order_id, awb_number, status: "CREATED" };
  }

  async track(order_id: string, courier_order_id: string): Promise<TrackResult> {
    const s = this.shipments.get(courier_order_id);
    return {
      order_id,
      courier_partner: this.name,
      awb_number: s?.awb ?? null,
      status: (s?.status as any) ?? "CREATED",
      history: [{ status: s?.status ?? "CREATED", timestamp: new Date().toISOString() }],
    };
  }

  async cancel(order_id: string, courier_order_id: string): Promise<CancelResult> {
    const s = this.shipments.get(courier_order_id);
    if (s) s.status = "CANCELLED";
    return { order_id, status: "CANCELLED" };
  }
}
