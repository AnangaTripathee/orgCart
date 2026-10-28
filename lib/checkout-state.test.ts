import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applySettleResult,
  isCartLocked,
  parseSavedCheckout,
  restoreCheckout,
  subtractPurchased,
  type CheckoutRecord,
} from "./checkout-state.ts";
import type { CheckoutReceipt } from "./checkout.ts";

const items = [{ productId: "cups-paper-12oz", quantity: 2 }];
const active: CheckoutRecord = { phase: "capturing", items, orderId: "ORDER-1", checkoutToken: "a.b", amountCents: 1498 };
const receipt: CheckoutReceipt = {
  orderId: "ORDER-1",
  captureId: "CAP-1",
  amountCents: 1498,
  currency: "USD",
  status: "COMPLETED",
  lines: [{ productId: "cups-paper-12oz", name: "Paper Cups, 12 oz", unitsPerPack: 50, unitLabel: "cups", quantity: 2, unitPriceCents: 749, lineTotalCents: 1498 }],
};

test("the cart is locked for every non-completed attempt", () => {
  assert.equal(isCartLocked(null), false);
  assert.equal(isCartLocked({ phase: "completed", items, receipt }), false);
  for (const phase of ["creating", "approving", "capturing", "interrupted", "declined", "pending", "uncertain"] as const) {
    assert.equal(isCartLocked({ ...active, phase }), true, phase);
  }
});

test("only a completed result produces a receipt", () => {
  assert.deepEqual(applySettleResult(active, { result: "completed", receipt }).record, { phase: "completed", items, receipt });
  for (const result of ["pending", "uncertain", "declined"] as const) {
    const next = applySettleResult(active, { result, message: "m" }).record;
    assert.equal(next?.phase, result);
    assert.equal(next?.receipt, undefined);
  }
});

test("uncertain and pending results keep identifiers for a retry", () => {
  for (const result of ["uncertain", "pending"] as const) {
    const next = applySettleResult(active, { result, message: "m" }).record!;
    assert.equal(next.orderId, "ORDER-1");
    assert.equal(next.checkoutToken, "a.b");
    assert.deepEqual(next.items, items);
    assert.equal(isCartLocked(next), true);
  }
});

test("definite non-payments release the cart with a notice", () => {
  for (const result of ["not_approved", "failed", "expired", "mismatch"] as const) {
    const next = applySettleResult(active, { result, message: "No payment." });
    assert.equal(next.record, null);
    assert.match(next.notice!, /Your cart is unchanged/);
  }
});

test("restoring after reload never assumes an outcome", () => {
  assert.equal(restoreCheckout({ phase: "creating", items }), null);
  assert.equal(restoreCheckout({ ...active, phase: "approving" })?.phase, "interrupted");
  assert.equal(restoreCheckout(active)?.phase, "uncertain");
  assert.equal(restoreCheckout({ ...active, phase: "pending" })?.phase, "pending");
  assert.equal(restoreCheckout(null), null);
});

test("saved checkout records are validated", () => {
  assert.deepEqual(parseSavedCheckout(JSON.stringify(active)), active);
  const invalid = [
    null,
    "not json",
    "[]",
    JSON.stringify({ ...active, phase: "paid" }),
    JSON.stringify({ ...active, items: [{ productId: "x", quantity: 0 }] }),
    JSON.stringify({ ...active, orderId: undefined }),
    JSON.stringify({ phase: "completed", items }),
  ];
  for (const raw of invalid) assert.equal(parseSavedCheckout(raw), null, String(raw));
});

test("only purchased packs are removed from the cart", () => {
  const cart = [
    { productId: "cups-paper-12oz", quantity: 3 },
    { productId: "plates-paper-9in", quantity: 1 },
  ];
  assert.deepEqual(subtractPurchased(cart, items), [
    { productId: "cups-paper-12oz", quantity: 1 },
    { productId: "plates-paper-9in", quantity: 1 },
  ]);
  assert.deepEqual(subtractPurchased(items, items), []);
});
