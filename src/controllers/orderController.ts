import { Router, Request, Response, NextFunction } from "express";
import { createOrderSchema, bulkOrderSchema } from "../validation";
import { ValidationError, NotFoundError } from "../errors";
import { createOrder, trackOrder, cancelOrder, getOrder } from "../services/orderService";
import { startBulk, getBatchStatus } from "../services/bulkService";

export const router = Router();

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
}

router.post(
  "/orders",
  wrap(async (req, res) => {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());

    const order = await createOrder(parsed.data);
    res.status(201).json(toOrderResponse(order));
  })
);

router.get(
  "/orders/:order_id/track",
  wrap(async (req, res) => {
    const result = await trackOrder(req.params.order_id);
    res.json(result);
  })
);

router.post(
  "/orders/:order_id/cancel",
  wrap(async (req, res) => {
    const result = await cancelOrder(req.params.order_id);
    res.json(result);
  })
);

router.post(
  "/orders/bulk",
  wrap(async (req, res) => {
    const parsed = bulkOrderSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());

    const batch_id = startBulk(parsed.data.orders);
    res.status(202).json({ batch_id, total: parsed.data.orders.length, status: "PROCESSING" });
  })
);

router.get(
  "/orders/bulk/:batch_id",
  wrap(async (req, res) => {
    res.json(getBatchStatus(req.params.batch_id));
  })
);

function toOrderResponse(order: any) {
  if (!order) throw new NotFoundError("Order not found");
  return {
    order_id: order.order_id,
    courier_partner: order.courier_partner,
    courier_order_id: order.courier_order_id,
    awb_number: order.awb_number,
    status: order.status,
  };
}
