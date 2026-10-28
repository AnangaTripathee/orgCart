import { randomUUID } from "node:crypto";
import {
  MAX_CHECKOUT_BODY_BYTES,
  buildOrderRequest,
  checkoutRequestSchema,
  priceCart,
} from "@/lib/checkout";
import {
  CHECKOUT_TTL_MS,
  readSigningSecret,
  signCheckoutToken,
  type CheckoutBinding,
} from "@/lib/server/checkout-token";
import { RequestError, jsonError, readJsonBody } from "@/lib/server/http";
import { PayPalApiError, createOrder, readPayPalConfig } from "@/lib/server/paypal";
import { orderMatchesBinding } from "@/lib/server/settle";

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
    body = await readJsonBody(request, MAX_CHECKOUT_BODY_BYTES);
  } catch (error) {
    return error instanceof RequestError
      ? jsonError(error.message, error.status)
      : jsonError("Could not read the request.", 400);
  }

  const parsed = checkoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid checkout request.", 400);
  }

  // Names and prices come from the server catalog only.
  const cart = priceCart(parsed.data.items);

  let order;
  try {
    order = await createOrder(config, buildOrderRequest(cart), randomUUID());
  } catch (error) {
    const message =
      error instanceof PayPalApiError ? error.message : "Could not create the PayPal order.";
    console.error(`[orgCart] create-order: ${message}`);
    return jsonError(`${message} Your cart was not charged.`, 502);
  }

  const binding: CheckoutBinding = {
    v: 1,
    orderId: order.id ?? "",
    items: cart.lines.map(({ productId, quantity }) => ({ productId, quantity })),
    currency: cart.currency,
    amountCents: cart.totalCents,
    captureRequestId: randomUUID(),
    exp: Date.now() + CHECKOUT_TTL_MS,
  };
  const created = order.status === "CREATED" || order.status === "PAYER_ACTION_REQUIRED";
  if (!order.id || !created || !orderMatchesBinding(order, binding)) {
    console.error(`[orgCart] create-order: unexpected PayPal order (status ${order.status ?? "missing"}).`);
    return jsonError("PayPal returned an unexpected order. Your cart was not charged.", 502);
  }

  return Response.json(
    {
      orderId: order.id,
      checkoutToken: signCheckoutToken(binding, secret),
      amountCents: cart.totalCents,
      currency: cart.currency,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
