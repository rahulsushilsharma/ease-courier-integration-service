import { CreateOrderRequest, CreateOrderResult, TrackResult, CancelResult } from "../types";

// Every courier plugs into the system by implementing this. Controllers/
// services only ever talk to this interface — never a concrete courier.
export interface CourierAdapter {
  readonly name: string;
  createOrder(req: CreateOrderRequest): Promise<CreateOrderResult>;
  track(order_id: string, courier_order_id: string): Promise<TrackResult>;
  cancel(order_id: string, courier_order_id: string): Promise<CancelResult>;
}
