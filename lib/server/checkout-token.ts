import "server-only";

// Signed checkout binding: ties a PayPal order ID to the server-validated cart
// snapshot and amount, with no database. Format: base64url(JSON).base64url(HMAC-SHA256).

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { CURRENCY, checkoutRequestSchema } from "../checkout.ts";

/** How long an order may be captured after creation. Reconciliation (lookup only) is allowed after. */
export const CHECKOUT_TTL_MS = 3 * 60 * 60 * 1000;
const MIN_SECRET_LENGTH = 32;

const bindingSchema = z.strictObject({
  v: z.literal(1),
  orderId: z.string().min(1).max(64),
  items: checkoutRequestSchema.shape.items,
  currency: z.literal(CURRENCY),
  amountCents: z.number().int().positive(),
  captureRequestId: z.uuid(),
  exp: z.number().int(),
});

export type CheckoutBinding = z.infer<typeof bindingSchema>;

export class CheckoutSecretError extends Error {}

export function readSigningSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.CHECKOUT_SIGNING_SECRET?.trim();
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new CheckoutSecretError(
      `Checkout signing is not configured. Set CHECKOUT_SIGNING_SECRET to a random value of at least ${MIN_SECRET_LENGTH} characters.`,
    );
  }
  return secret;
}

function sign(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

export function signCheckoutToken(binding: CheckoutBinding, secret: string): string {
  const payload = Buffer.from(JSON.stringify(binding)).toString("base64url");
  return `${payload}.${sign(payload, secret).toString("base64url")}`;
}

export type VerifyResult =
  | { ok: true; binding: CheckoutBinding; expired: boolean }
  | { ok: false };

/** Verifies the signature and shape. An expired binding is returned with `expired: true`. */
export function verifyCheckoutToken(token: string, secret: string, now = Date.now()): VerifyResult {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return { ok: false };

  const expected = sign(payload, secret);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false };

  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false };
  }
  const parsed = bindingSchema.safeParse(data);
  if (!parsed.success) return { ok: false };
  return { ok: true, binding: parsed.data, expired: now >= parsed.data.exp };
}
