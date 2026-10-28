// Run with `npm test` (Node's built-in test runner with native TypeScript support).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_QUANTITY,
  addLine,
  cartTotalCents,
  parseSavedCart,
  removeLine,
  serializeCart,
  setLineQuantity,
} from "./cart.ts";
import { PRODUCTS, PRODUCTS_BY_ID } from "./catalog.ts";

const KNOWN = new Set(["cups", "plates"]);
const PRICES: Record<string, number> = { cups: 749, plates: 899 };
const price = (id: string) => PRICES[id];

test("catalog has unique IDs, integer cents, and positive pack sizes", () => {
  assert.equal(PRODUCTS_BY_ID.size, PRODUCTS.length);
  for (const product of PRODUCTS) {
    assert.ok(Number.isInteger(product.priceCents) && product.priceCents > 0, product.id);
    assert.ok(Number.isInteger(product.unitsPerPack) && product.unitsPerPack > 0, product.id);
  }
});

test("adding the same product twice yields one line with quantity 2", () => {
  const lines = addLine(addLine([], "cups"), "cups");
  assert.deepEqual(lines, [{ productId: "cups", quantity: 2 }]);
});

test("quantities are clamped to 1..MAX_QUANTITY", () => {
  const lines = [{ productId: "cups", quantity: 1 }];
  assert.equal(setLineQuantity(lines, "cups", 0)[0].quantity, 1);
  assert.equal(setLineQuantity(lines, "cups", 500)[0].quantity, MAX_QUANTITY);
  const atMax = [{ productId: "cups", quantity: MAX_QUANTITY }];
  assert.equal(addLine(atMax, "cups")[0].quantity, MAX_QUANTITY);
});

test("totals are integer cents derived from prices and quantities", () => {
  let lines = addLine(addLine([], "cups"), "plates");
  lines = setLineQuantity(lines, "cups", 3);
  assert.equal(cartTotalCents(lines, price), 3 * 749 + 899);
  assert.equal(cartTotalCents(removeLine(lines, "cups"), price), 899);
  assert.equal(cartTotalCents([], price), 0);
});

test("unknown products contribute nothing to the total", () => {
  assert.equal(cartTotalCents([{ productId: "gone", quantity: 5 }], price), 0);
});

test("saved carts round-trip with IDs and quantities only", () => {
  const lines = [{ productId: "cups", quantity: 4 }];
  const raw = serializeCart(lines);
  assert.equal(raw, '[{"productId":"cups","quantity":4}]');
  assert.deepEqual(parseSavedCart(raw, KNOWN), lines);
});

test("invalid saved data is ignored without throwing", () => {
  for (const raw of [null, "", "not json", "{}", "42", "null", '"cups"']) {
    assert.deepEqual(parseSavedCart(raw, KNOWN), [], String(raw));
  }
  const messy = JSON.stringify([
    { productId: "cups", quantity: 2 },
    { productId: "unknown", quantity: 1 },
    { productId: "plates", quantity: 0 },
    { productId: "plates", quantity: 1.5 },
    { productId: "plates", quantity: "3" },
    { productId: "plates", quantity: 100 },
    { productId: 7, quantity: 1 },
    null,
    "cups",
    { productId: "cups", quantity: 9 },
    { productId: "plates", quantity: 5, priceCents: 1 },
  ]);
  assert.deepEqual(parseSavedCart(messy, KNOWN), [
    { productId: "cups", quantity: 2 },
    { productId: "plates", quantity: 5 },
  ]);
});
