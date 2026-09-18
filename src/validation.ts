import { z } from "zod";

const addressSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(6),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().min(3),
  country: z.string().min(2),
});

export const createOrderSchema = z.object({
  order_id: z.string().min(1),
  courier_partner: z.string().min(1),
  pickup_address: addressSchema,
  drop_address: addressSchema,
  package: z.object({
    weight_kg: z.number().positive(),
    length_cm: z.number().positive().optional(),
    width_cm: z.number().positive().optional(),
    height_cm: z.number().positive().optional(),
    declared_value: z.number().nonnegative().optional(),
  }),
  payment_mode: z.enum(["PREPAID", "COD"]).optional(),
  cod_amount: z.number().nonnegative().optional(),
});

export const bulkOrderSchema = z.object({
  orders: z.array(createOrderSchema).min(1).max(100),
});
