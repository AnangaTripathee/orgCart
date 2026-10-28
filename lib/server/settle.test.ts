// PayPal is mocked here; no network calls are made.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { CheckoutBinding } from "./checkout-token.ts";
import { PayPalApiError, type PayPalOrder } from "./paypal.ts";
import { settleCheckout, type SettleDeps } from "./settle.ts";

const binding: CheckoutBinding = {
  v: 1,
  orderId: "ORDER-1",
  items: [
    { productId: "cups-paper-12oz", quantity: 2 },
    { productId: "plates-paper-9in", quantity: 1 },
  ],
  currency: "USD",
  amountCents: 2397,
  captureRequestId: "0d5b6f7e-1c2d-4e3f-8a9b-0c1d2e3f4a5b",
  exp: Date.now() + 60_000,
};

function order(status: string, capture?: { id?: string; status: string; value?: string; currency?: string; reason?: string }, overrides: Partial<PayPalOrder> = {}): PayPalOrder {
  return {
    id: "ORDER-1",
    status,
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: { currency_code: "USD", value: "23.97", breakdown: { item_total: { currency_code: "USD", value: "23.97" } } },
        items: [
          { sku: "cups-paper-12oz", quantity: "2", unit_amount: { currency_code: "USD", value: "7.49" } },
          { sku: "plates-paper-9in", quantity: "1", unit_amount: { currency_code: "USD", value: "8.99" } },
        ],
        ...(capture && {
          payments: {
            captures: [{
              id: capture.id ?? "CAPTURE-1",
              status: capture.status,
              amount: { currency_code: capture.currency ?? "USD", value: capture.value ?? "23.97" },
              status_details: capture.reason ? { reason: capture.reason } : undefined,
            }],
          },
        }),
      },
    ],
    ...overrides,
  };
}

const apiError = (status: number | null, issues: string[] = [], uncertain = false) =>
  new PayPalApiError(`PayPal capture failed (${status}).`, status, "UNPROCESSABLE_ENTITY", issues, "debug123", uncertain);

function mock(getOrders: (PayPalOrder | Error)[], captures: (PayPalOrder | Error)[] = []) {
  const calls = { get: 0, capture: [] as string[] };
  const deps: SettleDeps = {
    async getOrder() {
      const next = getOrders[Math.min(calls.get++, getOrders.length - 1)];
      if (next instanceof Error) throw next;
      return next;
    },
    async captureOrder(_id, requestId) {
      calls.capture.push(requestId);
      const next = captures.shift();
      if (!next) throw new Error("unexpected capture");
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { deps, calls };
}

test("approved order is captured and a completed capture yields a receipt", async () => {
  const { deps, calls } = mock([order("APPROVED")], [order("COMPLETED", { status: "COMPLETED" })]);
  const result = await settleCheckout(binding, false, deps);
  assert.equal(result.result, "completed");
  assert.equal(result.result === "completed" && result.receipt.captureId, "CAPTURE-1");
  assert.equal(result.result === "completed" && result.receipt.amountCents, 2397);
  assert.deepEqual(
    result.result === "completed" && result.receipt.lines.map((l) => [l.productId, l.quantity]),
    [["cups-paper-12oz", 2], ["plates-paper-9in", 1]],
  );
  assert.deepEqual(calls.capture, [binding.captureRequestId]);
});

test("an already-completed order is reported from PayPal's capture without recapturing", async () => {
  const { deps, calls } = mock([order("COMPLETED", { status: "COMPLETED" })]);
  assert.equal((await settleCheckout(binding, false, deps)).result, "completed");
  assert.equal(calls.capture.length, 0);
});

test("ORDER_ALREADY_CAPTURED is reconciled by looking up the existing capture", async () => {
  const { deps } = mock(
    [order("APPROVED"), order("COMPLETED", { status: "COMPLETED" })],
    [apiError(422, ["ORDER_ALREADY_CAPTURED"])],
  );
  assert.equal((await settleCheckout(binding, false, deps)).result, "completed");
});

test("pending captures are never reported as completed", async () => {
  const { deps } = mock([order("APPROVED")], [order("COMPLETED", { status: "PENDING", reason: "PENDING_REVIEW" })]);
  const result = await settleCheckout(binding, false, deps);
  assert.equal(result.result, "pending");
  assert.match(result.result === "pending" ? result.message : "", /PENDING_REVIEW/);
});

test("declined and failed captures are failures", async () => {
  for (const status of ["DECLINED", "FAILED"]) {
    const { deps } = mock([order("APPROVED")], [order("COMPLETED", { status })]);
    assert.equal((await settleCheckout(binding, false, deps)).result, "failed", status);
  }
});

test("INSTRUMENT_DECLINED is recoverable and keeps the same order", async () => {
  const { deps } = mock([order("APPROVED")], [apiError(422, ["INSTRUMENT_DECLINED"])]);
  assert.equal((await settleCheckout(binding, false, deps)).result, "declined");
});

test("capture amount or currency mismatches are not treated as paid", async () => {
  for (const capture of [{ status: "COMPLETED", value: "1.00" }, { status: "COMPLETED", currency: "EUR" }]) {
    const { deps } = mock([order("COMPLETED", capture)]);
    assert.equal((await settleCheckout(binding, false, deps)).result, "mismatch");
  }
});

test("orders that don't match the binding are never captured", async () => {
  const variants: PayPalOrder[] = [
    order("APPROVED", undefined, { id: "OTHER" }),
    order("APPROVED", undefined, { intent: "AUTHORIZE" }),
    { ...order("APPROVED"), purchase_units: [{ ...order("APPROVED").purchase_units![0], amount: { currency_code: "USD", value: "1.00" } }] },
    { ...order("APPROVED"), purchase_units: [{ ...order("APPROVED").purchase_units![0], amount: { currency_code: "EUR", value: "23.97" } }] },
    { ...order("APPROVED"), purchase_units: [{ ...order("APPROVED").purchase_units![0], items: [{ sku: "cups-paper-12oz", quantity: "3" }] }] },
  ];
  for (const variant of variants) {
    const { deps, calls } = mock([variant]);
    assert.equal((await settleCheckout(binding, false, deps)).result, "mismatch");
    assert.equal(calls.capture.length, 0);
  }
});

test("unapproved, voided, and missing orders are not captured", async () => {
  for (const [status, expected] of [["CREATED", "not_approved"], ["PAYER_ACTION_REQUIRED", "not_approved"], ["VOIDED", "failed"]]) {
    const { deps, calls } = mock([order(status)]);
    assert.equal((await settleCheckout(binding, false, deps)).result, expected, status);
    assert.equal(calls.capture.length, 0);
  }
  const { deps } = mock([apiError(404)]);
  assert.equal((await settleCheckout(binding, false, deps)).result, "failed");
});

test("an expired binding never captures, but can still reconcile a completed order", async () => {
  const approved = mock([order("APPROVED")]);
  assert.equal((await settleCheckout(binding, true, approved.deps)).result, "expired");
  assert.equal(approved.calls.capture.length, 0);
  const completed = mock([order("COMPLETED", { status: "COMPLETED" })]);
  assert.equal((await settleCheckout(binding, true, completed.deps)).result, "completed");
});

test("timeouts and 5xx are uncertain, and a retry reuses the capture request ID", async () => {
  const { deps, calls } = mock(
    [order("APPROVED"), order("APPROVED")],
    [apiError(null, [], true), order("COMPLETED", { status: "COMPLETED" })],
  );
  assert.equal((await settleCheckout(binding, false, deps)).result, "uncertain");
  assert.equal((await settleCheckout(binding, false, deps)).result, "completed");
  assert.deepEqual(calls.capture, [binding.captureRequestId, binding.captureRequestId]);
});

test("lookup failures other than 404 are uncertain, not failed", async () => {
  for (const error of [apiError(null, [], true), apiError(401), new Error("boom")]) {
    const { deps } = mock([error]);
    assert.equal((await settleCheckout(binding, false, deps)).result, "uncertain");
  }
});

test("a completed order without a capture record is uncertain", async () => {
  const { deps } = mock([order("COMPLETED")]);
  assert.equal((await settleCheckout(binding, false, deps)).result, "uncertain");
});
