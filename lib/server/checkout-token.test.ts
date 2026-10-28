// Run with `npm test` (uses the react-server condition so "server-only" resolves).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readSigningSecret,
  signCheckoutToken,
  verifyCheckoutToken,
  type CheckoutBinding,
} from "./checkout-token.ts";

const SECRET = "test-secret-test-secret-test-secret-123";
const NOW = 1_800_000_000_000;
const binding: CheckoutBinding = {
  v: 1,
  orderId: "5O190127TN364715T",
  items: [{ productId: "cups-paper-12oz", quantity: 2 }],
  currency: "USD",
  amountCents: 1498,
  captureRequestId: "0d5b6f7e-1c2d-4e3f-8a9b-0c1d2e3f4a5b",
  exp: NOW + 60_000,
};

test("a signed binding verifies and round-trips", () => {
  const result = verifyCheckoutToken(signCheckoutToken(binding, SECRET), SECRET, NOW);
  assert.deepEqual(result, { ok: true, binding, expired: false });
});

test("expired bindings are flagged, not silently accepted", () => {
  const result = verifyCheckoutToken(signCheckoutToken(binding, SECRET), SECRET, binding.exp);
  assert.equal(result.ok && result.expired, true);
});

test("tampered, re-signed, or malformed tokens are rejected", () => {
  const token = signCheckoutToken(binding, SECRET);
  const [, signature] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ ...binding, amountCents: 1 })).toString("base64url");
  const cases = [
    `${forged}.${signature}`,
    signCheckoutToken(binding, "another-secret-another-secret-another"),
    token.slice(0, -2),
    `${token}.extra`,
    "",
    "not-a-token",
    signCheckoutToken({ ...binding, currency: "EUR" } as unknown as CheckoutBinding, SECRET),
    signCheckoutToken({ ...binding, items: [] }, SECRET),
  ];
  for (const candidate of cases) {
    assert.deepEqual(verifyCheckoutToken(candidate, SECRET, NOW), { ok: false }, candidate.slice(0, 20));
  }
});

test("the signing secret must be configured and long enough", () => {
  assert.throws(() => readSigningSecret({}), /CHECKOUT_SIGNING_SECRET/);
  assert.throws(() => readSigningSecret({ CHECKOUT_SIGNING_SECRET: "short" }));
  assert.equal(readSigningSecret({ CHECKOUT_SIGNING_SECRET: SECRET }), SECRET);
});
