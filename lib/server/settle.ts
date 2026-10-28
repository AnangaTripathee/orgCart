import "server-only";

// Captures or reconciles a bound checkout. PayPal is always read first so an
// order is only captured when it is APPROVED and matches its binding, and an
// already-completed order is reported from PayPal's own capture record.

import { priceCart, valueToCents, CURRENCY, type SettleResult } from "../checkout.ts";
import type { CheckoutBinding } from "./checkout-token.ts";
import { PayPalApiError, type PayPalOrder } from "./paypal.ts";

export type SettleDeps = {
  getOrder: (orderId: string) => Promise<PayPalOrder>;
  captureOrder: (orderId: string, requestId: string) => Promise<PayPalOrder>;
};

const UNCERTAIN_MESSAGE =
  "We couldn't confirm the payment with PayPal. It may or may not have completed. Recheck the status before trying again.";

/** True when PayPal's order matches the server-issued binding exactly. */
export function orderMatchesBinding(order: PayPalOrder, binding: CheckoutBinding): boolean {
  const units = order.purchase_units ?? [];
  if (order.id !== binding.orderId || order.intent !== "CAPTURE" || units.length !== 1) return false;
  const [unit] = units;
  if (unit.amount?.currency_code !== binding.currency) return false;
  if (valueToCents(unit.amount.value) !== binding.amountCents) return false;

  const itemTotal = unit.amount.breakdown?.item_total;
  if (itemTotal && (itemTotal.currency_code !== binding.currency || valueToCents(itemTotal.value) !== binding.amountCents)) {
    return false;
  }
  if (unit.items) {
    if (unit.items.length !== binding.items.length) return false;
    const expected = new Map(binding.items.map((item) => [item.productId, String(item.quantity)]));
    for (const item of unit.items) {
      if (!item.sku || expected.get(item.sku) !== item.quantity) return false;
      expected.delete(item.sku);
    }
  }
  return true;
}

/** Interprets the capture recorded on an order. Only a matching COMPLETED capture is a success. */
export function evaluateCapture(order: PayPalOrder, binding: CheckoutBinding): SettleResult {
  const captures = order.purchase_units?.[0]?.payments?.captures ?? [];
  const capture = captures.find((c) => c.status === "COMPLETED") ?? captures[0];
  if (!capture?.id || !capture.status) {
    return { result: "uncertain", message: UNCERTAIN_MESSAGE };
  }
  if (capture.amount?.currency_code !== CURRENCY || valueToCents(capture.amount.value) !== binding.amountCents) {
    return {
      result: "mismatch",
      message: `PayPal reported a capture (${capture.id}) whose amount doesn't match this checkout. It was not treated as a successful payment.`,
    };
  }
  switch (capture.status) {
    case "COMPLETED":
      return {
        result: "completed",
        receipt: {
          orderId: binding.orderId,
          captureId: capture.id,
          amountCents: binding.amountCents,
          currency: CURRENCY,
          status: "COMPLETED",
          lines: priceCart(binding.items).lines,
        },
      };
    case "PENDING":
      return {
        result: "pending",
        captureId: capture.id,
        message: `PayPal is holding this payment as pending${
          capture.status_details?.reason ? ` (${capture.status_details.reason})` : ""
        }. It is not complete yet. Recheck the status later.`,
      };
    case "DECLINED":
    case "FAILED":
      return { result: "failed", message: "PayPal declined the payment. No money was captured." };
    default:
      return {
        result: "failed",
        message: `PayPal reports this payment as ${capture.status}. It was not treated as a completed purchase.`,
      };
  }
}

async function lookupAndEvaluate(binding: CheckoutBinding, deps: SettleDeps): Promise<SettleResult> {
  try {
    return evaluateCapture(await deps.getOrder(binding.orderId), binding);
  } catch {
    return { result: "uncertain", message: UNCERTAIN_MESSAGE };
  }
}

export async function settleCheckout(
  binding: CheckoutBinding,
  expired: boolean,
  deps: SettleDeps,
): Promise<SettleResult> {
  let order: PayPalOrder;
  try {
    order = await deps.getOrder(binding.orderId);
  } catch (error) {
    if (error instanceof PayPalApiError && error.status === 404) {
      return { result: "failed", message: "PayPal no longer has this order. No payment was captured." };
    }
    return { result: "uncertain", message: UNCERTAIN_MESSAGE };
  }

  if (!orderMatchesBinding(order, binding)) {
    return {
      result: "mismatch",
      message: "This PayPal order doesn't match the checkout orgCart created, so it was not captured.",
    };
  }

  switch (order.status) {
    case "COMPLETED":
      return evaluateCapture(order, binding);
    case "CREATED":
    case "PAYER_ACTION_REQUIRED":
      return { result: "not_approved", message: "The payment hasn't been approved in PayPal yet." };
    case "VOIDED":
      return { result: "failed", message: "This PayPal order was voided. No payment was captured." };
    case "APPROVED":
      break;
    default:
      return { result: "uncertain", message: UNCERTAIN_MESSAGE };
  }

  if (expired) {
    return {
      result: "expired",
      message: "This checkout expired before payment was captured. No money was taken. Please check out again.",
    };
  }

  let captured: PayPalOrder;
  try {
    captured = await deps.captureOrder(binding.orderId, binding.captureRequestId);
  } catch (error) {
    if (!(error instanceof PayPalApiError) || error.uncertain) {
      return { result: "uncertain", message: UNCERTAIN_MESSAGE };
    }
    if (error.hasIssue("INSTRUMENT_DECLINED")) {
      return {
        result: "declined",
        message: "Your PayPal payment method was declined. Choose PayPal again to pick a different funding source.",
      };
    }
    if (error.hasIssue("ORDER_ALREADY_CAPTURED")) {
      return lookupAndEvaluate(binding, deps);
    }
    if (error.hasIssue("ORDER_NOT_APPROVED") || error.hasIssue("PAYER_ACTION_REQUIRED")) {
      return { result: "not_approved", message: "PayPal says the payment still needs your approval." };
    }
    return { result: "failed", message: `${error.message} No payment was captured.` };
  }

  if (captured.id !== binding.orderId) {
    return { result: "uncertain", message: UNCERTAIN_MESSAGE };
  }
  return evaluateCapture(captured, binding);
}
