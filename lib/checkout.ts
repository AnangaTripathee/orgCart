// Checkout request validation and server-authoritative pricing.
// Relative `.ts` imports keep this module runnable under `node --test`.

import { z } from "zod";
import { MAX_QUANTITY, MIN_QUANTITY, type CartLine } from "./cart.ts";
import { PRODUCTS, PRODUCTS_BY_ID } from "./catalog.ts";

export const CURRENCY = "USD";

/** Upper bound on a checkout request body, in bytes. */
export const MAX_CHECKOUT_BODY_BYTES = 4096;

/** The browser sends product IDs and pack quantities only. */
export const checkoutRequestSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        productId: z
          .string()
          .max(64)
          .refine((id) => PRODUCTS_BY_ID.has(id), "Unknown product."),
        quantity: z
          .number()
          .int("Quantity must be a whole number of packs.")
          .min(MIN_QUANTITY, `Quantity must be at least ${MIN_QUANTITY} pack.`)
          .max(MAX_QUANTITY, `Quantity cannot exceed ${MAX_QUANTITY} packs.`),
      }),
    )
    .min(1, "Your cart is empty.")
    .max(PRODUCTS.length, "Too many cart lines.")
    .refine(
      (items) => new Set(items.map((item) => item.productId)).size === items.length,
      "Each product may appear only once.",
    ),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

/** A purchased line described entirely from the server catalog. */
export type PricedLine = {
  productId: string;
  name: string;
  unitsPerPack: number;
  unitLabel: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

export type PricedCart = {
  lines: PricedLine[];
  totalCents: number;
  currency: typeof CURRENCY;
};

/**
 * Prices validated cart lines from the catalog. Throws if a product is
 * unknown, so callers must validate input first.
 */
export function priceCart(items: readonly CartLine[]): PricedCart {
  const lines = items.map(({ productId, quantity }) => {
    const product = PRODUCTS_BY_ID.get(productId);
    if (!product) throw new Error(`Unknown product: ${productId}`);
    return {
      productId,
      name: product.name,
      unitsPerPack: product.unitsPerPack,
      unitLabel: product.unitLabel,
      quantity,
      unitPriceCents: product.priceCents,
      lineTotalCents: product.priceCents * quantity,
    };
  });
  const totalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  return { lines, totalCents, currency: CURRENCY };
}

/** Formats integer cents as a PayPal amount string, e.g. 1299 → "12.99". */
export function centsToValue(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error("Amount must be a non-negative integer number of cents.");
  }
  const dollars = Math.floor(cents / 100);
  return `${dollars}.${String(cents % 100).padStart(2, "0")}`;
}

/** Parses a PayPal amount string into integer cents; null if malformed. */
export function valueToCents(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** PayPal item name that makes the pack size explicit. */
export function paypalItemName(line: PricedLine): string {
  return `${line.name} (pack of ${line.unitsPerPack} ${line.unitLabel})`.slice(0, 127);
}

/** Orders v2 request body: USD, intent CAPTURE, itemized packs, no shipping or tax. */
export function buildOrderRequest(cart: PricedCart) {
  const money = (cents: number) => ({
    currency_code: cart.currency,
    value: centsToValue(cents),
  });
  return {
    intent: "CAPTURE",
    purchase_units: [
      {
        description: "orgCart sandbox demo: event supplies",
        amount: {
          ...money(cart.totalCents),
          breakdown: { item_total: money(cart.totalCents) },
        },
        items: cart.lines.map((line) => ({
          name: paypalItemName(line),
          sku: line.productId,
          quantity: String(line.quantity),
          unit_amount: money(line.unitPriceCents),
        })),
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "orgCart",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
        },
      },
    },
  };
}

/** Receipt shown only after the backend confirms a completed capture. */
export type CheckoutReceipt = {
  orderId: string;
  captureId: string;
  amountCents: number;
  currency: typeof CURRENCY;
  status: "COMPLETED";
  lines: PricedLine[];
};

/**
 * Outcome of a capture/reconcile request. Only "completed" means money moved
 * and was confirmed; "pending" and "uncertain" must never be shown as paid.
 */
export type SettleResult =
  | { result: "completed"; receipt: CheckoutReceipt }
  | { result: "pending"; message: string; captureId?: string }
  | { result: "declined"; message: string }
  | { result: "not_approved"; message: string }
  | { result: "failed"; message: string }
  | { result: "expired"; message: string }
  | { result: "mismatch"; message: string }
  | { result: "uncertain"; message: string };
