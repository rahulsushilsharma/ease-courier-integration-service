// Unified, courier-agnostic DTOs. These NEVER change shape per courier.

export type ShipmentStatus =
  | "CREATED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CANCELLED"
  | "FAILED";

export interface Address {
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface CreateOrderRequest {
  order_id: string; // caller-supplied, used for idempotency
  courier_partner: string;
  pickup_address: Address;
  drop_address: Address;
  package: {
    weight_kg: number;
    length_cm?: number;
    width_cm?: number;
    height_cm?: number;
    declared_value?: number;
  };
  payment_mode?: "PREPAID" | "COD";
  cod_amount?: number;
}

export interface CreateOrderResult {
  order_id: string;
  courier_partner: string;
  courier_order_id: string;
  awb_number: string;
  status: ShipmentStatus;
}

export interface TrackResult {
  order_id: string;
  courier_partner: string;
  awb_number: string | null;
  status: ShipmentStatus;
  history: { status: string; timestamp: string; raw?: unknown }[];
}

export interface CancelResult {
  order_id: string;
  status: ShipmentStatus;
}

export interface BulkOrderItem extends CreateOrderRequest {}

export interface BulkItemResult {
  order_id: string;
  success: boolean;
  status?: ShipmentStatus;
  awb_number?: string;
  error?: { code: string; message: string };
}
