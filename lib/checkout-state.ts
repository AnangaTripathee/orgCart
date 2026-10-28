// Client checkout-attempt state, kept pure so it can be unit tested.
// The record is persisted so a refresh never loses the identifiers needed to
// recheck a payment whose outcome is unknown.

import { MAX_QUANTITY, isValidQuantity, type CartLine } from "./cart.ts";
import type { CheckoutReceipt, SettleResult } from "./checkout.ts";

export type CheckoutPhase =
  /** Creating the PayPal order on our server. */
  | "creating"
  /** Order created; the buyer is approving in PayPal. */
  | "approving"
  /** Buyer approved; our server is capturing. */
  | "capturing"
  /** The page reloaded mid-approval; the order may or may not be approved. */
  | "interrupted"
  /** The buyer's funding source was declined; they may pick another one for the same order. */
  | "declined"
  /** PayPal reported a pending capture. Not paid yet. */
  | "pending"
  /** The capture outcome is unknown (timeout, network failure, 5xx). */
  | "uncertain"
  /** The backend confirmed a completed capture. */
  | "completed";

export type CheckoutRecord = {
  phase: CheckoutPhase;
  /** Cart snapshot sent to the server when checkout started. */
  items: CartLine[];
  orderId?: string;
  checkoutToken?: string;
  amountCents?: number;
  message?: string;
  captureId?: string;
  receipt?: CheckoutReceipt;
};

const PHASES: readonly CheckoutPhase[] = [
  "creating",
  "approving",
  "capturing",
  "interrupted",
  "declined",
  "pending",
  "uncertain",
  "completed",
];

/** Phases where the buyer may abandon the attempt without risking a duplicate payment. */
export const CANCELLABLE_PHASES: readonly CheckoutPhase[] = ["creating", "approving", "interrupted", "declined"];

/** The cart cannot be edited while any non-completed checkout attempt exists. */
export function isCartLocked(record: CheckoutRecord | null): boolean {
  return record !== null && record.phase !== "completed";
}

/** Phases that need the user to recheck the payment with the server. */
export function needsRecheck(record: CheckoutRecord | null): boolean {
  return record !== null && ["interrupted", "pending", "uncertain"].includes(record.phase);
}

const isString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/** Validates a saved record; anything malformed is discarded. Never throws. */
export function parseSavedCheckout(raw: string | null): CheckoutRecord | null {
  if (raw === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  if (!PHASES.includes(record.phase as CheckoutPhase) || !Array.isArray(record.items)) return null;

  const items: CartLine[] = [];
  for (const item of record.items as unknown[]) {
    const line = item as Record<string, unknown> | null;
    if (!line || !isString(line.productId) || !isValidQuantity(line.quantity)) return null;
    items.push({ productId: line.productId, quantity: line.quantity });
  }

  const parsed: CheckoutRecord = { phase: record.phase as CheckoutPhase, items };
  if (isString(record.orderId)) parsed.orderId = record.orderId;
  if (isString(record.checkoutToken)) parsed.checkoutToken = record.checkoutToken;
  if (Number.isSafeInteger(record.amountCents)) parsed.amountCents = record.amountCents as number;
  if (isString(record.message)) parsed.message = record.message;
  if (isString(record.captureId)) parsed.captureId = record.captureId;

  if (parsed.phase === "completed") {
    const receipt = record.receipt as CheckoutReceipt | undefined;
    if (!receipt || !isString(receipt.orderId) || !isString(receipt.captureId) || !Array.isArray(receipt.lines)) {
      return null;
    }
    parsed.receipt = receipt;
  } else if (parsed.phase !== "creating" && (!parsed.orderId || !parsed.checkoutToken)) {
    // Without identifiers there is nothing to recheck, and no order can be captured.
    return null;
  }
  return parsed;
}

/**
 * Adjusts a record restored after a page load. A request that was in flight
 * when the page unloaded has an unknown outcome, so it is never assumed.
 */
export function restoreCheckout(record: CheckoutRecord | null): CheckoutRecord | null {
  if (!record) return null;
  switch (record.phase) {
    case "creating":
      // No order ID reached the browser, so nothing can be captured.
      return null;
    case "approving":
      return {
        ...record,
        phase: "interrupted",
        message:
          "A checkout started earlier (possibly in another tab) hasn't finished. If you approved the payment, check its status; otherwise you can cancel it.",
      };
    case "capturing":
      return {
        ...record,
        phase: "uncertain",
        message: "The page reloaded while the payment was being confirmed. Recheck the status before doing anything else.",
      };
    default:
      return record;
  }
}

export type SettleTransition = {
  record: CheckoutRecord | null;
  /** Short message to show once the attempt ends. */
  notice?: string;
};

/** Applies a capture/reconcile result to the current attempt. */
export function applySettleResult(record: CheckoutRecord, outcome: SettleResult): SettleTransition {
  switch (outcome.result) {
    case "completed":
      return { record: { phase: "completed", items: record.items, receipt: outcome.receipt } };
    case "pending":
      return { record: { ...record, phase: "pending", message: outcome.message, captureId: outcome.captureId } };
    case "uncertain":
      return { record: { ...record, phase: "uncertain", message: outcome.message } };
    case "declined":
      return { record: { ...record, phase: "declined", message: outcome.message } };
    case "not_approved":
    case "failed":
    case "expired":
    case "mismatch":
      // Definitively not paid: release the cart unchanged.
      return { record: null, notice: `${outcome.message} Your cart is unchanged.` };
  }
}

/** Removes purchased pack quantities from the cart, dropping lines that reach zero. */
export function subtractPurchased(cart: readonly CartLine[], purchased: readonly CartLine[]): CartLine[] {
  const bought = new Map(purchased.map((line) => [line.productId, line.quantity]));
  return cart.flatMap((line) => {
    const remaining = line.quantity - (bought.get(line.productId) ?? 0);
    return remaining > 0 ? [{ ...line, quantity: Math.min(remaining, MAX_QUANTITY) }] : [];
  });
}
