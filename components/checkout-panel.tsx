"use client";

import { useRef, useState } from "react";
import {
  INSTANCE_LOADING_STATE,
  PayPalOneTimePaymentButton,
  PayPalProvider,
  usePayPal,
} from "@paypal/react-paypal-js/sdk-v6";
import type { CheckoutRecord } from "@/lib/checkout-state";
import type { SettleResult } from "@/lib/checkout";
import { formatUSD } from "@/lib/format";
import { getCartLines, removePurchasedItems } from "./use-cart";
import { checkoutActions, getCheckoutState, useCheckout } from "./use-checkout";

const CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

const UNCERTAIN: SettleResult = {
  result: "uncertain",
  message:
    "We couldn't reach orgCart's server to confirm the payment. It may or may not have completed. Recheck the status before trying again.",
};

const SETTLE_RESULTS: readonly string[] = [
  "pending",
  "declined",
  "not_approved",
  "failed",
  "expired",
  "mismatch",
  "uncertain",
];

const messageOf =(error: unknown) =>
  error instanceof Error && error.message ? error.message : "Something went wrong.";

/** Asks our server to capture or reconcile. Anything unreadable is treated as uncertain. */
async function requestSettlement(record: CheckoutRecord): Promise<SettleResult> {
  let response: Response;
  try {
    response = await fetch("/api/paypal/capture-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: record.orderId, checkoutToken: record.checkoutToken }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    return UNCERTAIN;
  }
  const data = (await response.json().catch(() => null)) as {
    result?: unknown;
    message?: unknown;
    error?: unknown;
    receipt?: { captureId?: unknown };
  } | null;
  if (data?.result === "completed") {
    return typeof data.receipt?.captureId === "string" ? (data as SettleResult) : UNCERTAIN;
  }
  if (typeof data?.result === "string" && SETTLE_RESULTS.includes(data.result) && typeof data.message === "string") {
    return data as SettleResult;
  }
  if (typeof data?.error === "string" && (response.status === 400 || response.status === 503)) {
    // The server rejected the request before contacting PayPal, so nothing was captured.
    return { result: "failed", message: data.error };
  }
  return UNCERTAIN;
}

async function settle(record: CheckoutRecord) {
  checkoutActions.capturing();
  const outcome = await requestSettlement(record);
  if (outcome.result === "completed") {
    // Clear purchased packs only after the backend confirmed the capture.
    removePurchasedItems(
      outcome.receipt.lines.map(({ productId, quantity }) => ({ productId, quantity })),
    );
  }
  checkoutActions.settle(outcome);
}

let ignoredErrors = 0;

async function createOrder(): Promise<{ orderId: string }> {
  const { record } = getCheckoutState();
  if (record?.phase === "declined" && record.orderId) {
    // Same order, new funding source (the v6 equivalent of restarting checkout).
    checkoutActions.reapprove();
    return { orderId: record.orderId };
  }
  const items = getCartLines();
  if (items.length === 0 || !checkoutActions.begin(items)) {
    // The SDK reports this rejection through onError; it must not end the active attempt.
    ignoredErrors++;
    throw new Error("A checkout is already in progress.");
  }
  try {
    const response = await fetch("/api/paypal/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data.orderId !== "string" || typeof data.checkoutToken !== "string") {
      throw new Error(typeof data.error === "string" ? data.error : "Could not start PayPal checkout.");
    }
    checkoutActions.created(data.orderId, data.checkoutToken, data.amountCents);
    return { orderId: data.orderId };
  } catch (error) {
    checkoutActions.cancel(`Couldn't start checkout: ${messageOf(error)}`);
    throw error;
  }
}

const callbacks = {
  createOrder,
  async onApprove({ orderId }: { orderId: string }) {
    const { record } = getCheckoutState();
    if (record?.orderId === orderId && record.checkoutToken) await settle(record);
  },
  onCancel() {
    checkoutActions.cancel("Checkout cancelled. Your cart is unchanged.");
  },
  onError(error: Error) {
    if (ignoredErrors > 0) {
      ignoredErrors--;
      return;
    }
    // Only ends attempts that cannot have taken money; capture handles its own errors.
    checkoutActions.cancel(`PayPal checkout ran into a problem (${messageOf(error)}). Your cart is unchanged.`);
  },
};

function PayPalButtonArea({ disabled }: { disabled: boolean }) {
  const { loadingStatus, error } = usePayPal();
  if (error || loadingStatus === INSTANCE_LOADING_STATE.REJECTED) {
    return (
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
        PayPal checkout couldn’t load. Check your connection or content blockers, then reload
        the page. Your cart is saved.
      </p>
    );
  }
  return (
    <div className="min-h-12">
      {loadingStatus === INSTANCE_LOADING_STATE.PENDING && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading PayPal…</p>
      )}
      <PayPalOneTimePaymentButton {...callbacks} disabled={disabled} />
    </div>
  );
}

const secondaryButton =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

const STATUS_TEXT: Partial<Record<CheckoutRecord["phase"], string>> = {
  creating: "Creating your PayPal sandbox order…",
  approving: "Waiting for you to approve the payment in the PayPal window…",
  capturing: "Confirming your payment with orgCart’s server. Please keep this page open…",
};

export function CheckoutPanel({ cartTotalCents }: { cartTotalCents: number }) {
  const { record, notice } = useCheckout();
  const [rechecking, setRechecking] = useState(false);
  const recheckRef = useRef(false);
  const phase = record?.phase;

  async function recheck() {
    if (!record || recheckRef.current) return;
    recheckRef.current = true;
    setRechecking(true);
    try {
      await settle(record);
    } finally {
      recheckRef.current = false;
      setRechecking(false);
    }
  }

  function release() {
    const ok = window.confirm(
      "Only do this if you've confirmed in your PayPal sandbox account that this payment did not complete.\n\nReleasing the cart lets you edit it and check out again, which could create a duplicate payment.",
    );
    if (ok) checkoutActions.release("Checkout released. Your cart is unchanged and can be edited again.");
  }

  if (phase === "completed") return null;

  const showButton = !phase || phase === "creating" || phase === "approving" || phase === "capturing" || phase === "declined";
  const buttonEnabled = !phase || phase === "declined";
  const amountCents = record?.amountCents ?? cartTotalCents;

  return (
    <div className="mt-4 space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Sandbox demo — no real money or goods.
      </p>

      {notice && (
        <div role="status" className="flex items-start justify-between gap-2 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800">
          <p>{notice}</p>
          <button
            type="button"
            onClick={checkoutActions.clearNotice}
            aria-label="Dismiss message"
            className="shrink-0 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ×
          </button>
        </div>
      )}

      {phase && STATUS_TEXT[phase] && (
        <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-medium">
          <span className="h-3 w-3 animate-pulse rounded-full bg-emerald-600" aria-hidden />
          {STATUS_TEXT[phase]}
        </p>
      )}

      {(phase === "declined" || phase === "interrupted" || phase === "pending" || phase === "uncertain") && (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          <p className="font-semibold">
            {phase === "declined"
              ? "Payment method declined"
              : phase === "pending"
                ? "Payment pending — not complete"
                : phase === "uncertain"
                  ? "Payment status unknown"
                  : "Checkout interrupted"}
          </p>
          {record?.message && <p>{record.message}</p>}
          {phase !== "declined" && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-xs">
              <dt>PayPal order ID</dt>
              <dd className="break-all font-mono">{record?.orderId}</dd>
              {record?.captureId && (
                <>
                  <dt>Capture ID</dt>
                  <dd className="break-all font-mono">{record.captureId}</dd>
                </>
              )}
            </dl>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {phase !== "declined" && (
              <button type="button" onClick={recheck} disabled={rechecking} className={secondaryButton}>
                {rechecking ? "Checking…" : "Recheck payment status"}
              </button>
            )}
            {(phase === "declined" || phase === "interrupted") && (
              <button
                type="button"
                onClick={() => checkoutActions.cancel("Checkout cancelled. Your cart is unchanged.")}
                disabled={rechecking}
                className={secondaryButton}
              >
                Cancel checkout
              </button>
            )}
          </div>
          {(phase === "pending" || phase === "uncertain") && (
            <button type="button" onClick={release} className="text-xs underline underline-offset-2">
              I confirmed in PayPal that this payment did not complete — release my cart
            </button>
          )}
        </div>
      )}

      {showButton && (
        <>
          <p className="text-sm">
            Pay <span className="font-semibold">{formatUSD(amountCents)}</span> USD with PayPal
            (sandbox).
          </p>
          {CLIENT_ID ? (
            <PayPalProvider clientId={CLIENT_ID} environment="sandbox" pageType="checkout" components={["paypal-payments"]}>
              <PayPalButtonArea disabled={!buttonEnabled} />
            </PayPalProvider>
          ) : (
            <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              PayPal sandbox checkout isn’t configured. Set NEXT_PUBLIC_PAYPAL_CLIENT_ID (see
              README) and restart the app. You can still browse and edit your cart.
            </p>
          )}
        </>
      )}
    </div>
  );
}
