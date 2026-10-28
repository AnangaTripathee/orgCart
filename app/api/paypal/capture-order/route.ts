import { z } from "zod";
import type { SettleResult } from "@/lib/checkout";
import { readSigningSecret, verifyCheckoutToken } from "@/lib/server/checkout-token";
import { RequestError, jsonError, readJsonBody } from "@/lib/server/http";
import { captureOrder, getOrder, readPayPalConfig } from "@/lib/server/paypal";
import { settleCheckout } from "@/lib/server/settle";

const MAX_BODY_BYTES = 8192;

const captureRequestSchema = z.strictObject({
  orderId: z.string().min(1).max(64),
  checkoutToken: z.string().min(1).max(MAX_BODY_BYTES),
});

const STATUS: Record<SettleResult["result"], number> = {
  completed: 200,
  pending: 202,
  declined: 422,
  not_approved: 409,
  failed: 422,
  expired: 410,
  mismatch: 409,
  uncertain: 503,
};

export async function POST(request: Request) {
  let config;
  let secret;
  try {
    config = readPayPalConfig();
    secret = readSigningSecret();
  } catch (error) {
    return jsonError((error as Error).message, 503);
  }

  let body: unknown;
  try {
    body = await readJsonBody(request, MAX_BODY_BYTES);
  } catch (error) {
    return error instanceof RequestError
      ? jsonError(error.message, error.status)
      : jsonError("Could not read the request.", 400);
  }

  const parsed = captureRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid capture request.", 400);

  // Only orders created by this server, for this cart, can be captured.
  const verified = verifyCheckoutToken(parsed.data.checkoutToken, secret);
  if (!verified.ok || verified.binding.orderId !== parsed.data.orderId) {
    return jsonError("This checkout could not be verified. No payment was captured.", 400);
  }

  const outcome = await settleCheckout(verified.binding, verified.expired, {
    getOrder: (orderId) => getOrder(config, orderId),
    captureOrder: (orderId, requestId) => captureOrder(config, orderId, requestId),
  });
  if (outcome.result !== "completed") {
    console.warn(`[orgCart] capture-order ${verified.binding.orderId}: ${outcome.result}`);
  }
  return Response.json(outcome, {
    status: STATUS[outcome.result],
    headers: { "Cache-Control": "no-store" },
  });
}
