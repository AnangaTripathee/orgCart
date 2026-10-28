import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildOrderRequest,
  centsToValue,
  checkoutRequestSchema,
  priceCart,
  valueToCents,
} from "./checkout.ts";
import { PRODUCTS } from "./catalog.ts";

const valid = { items: [{ productId: "cups-paper-12oz", quantity: 2 }, { productId: "plates-paper-9in", quantity: 1 }] };

test("accepts a valid checkout request", () => {
  assert.equal(checkoutRequestSchema.safeParse(valid).success, true);
});

test("rejects invalid checkout requests", () => {
  const cases: [string, unknown][] = [
    ["empty cart", { items: [] }],
    ["missing items", {}],
    ["unknown product", { items: [{ productId: "laptop", quantity: 1 }] }],
    ["duplicate product", { items: [{ productId: "cups-paper-12oz", quantity: 1 }, { productId: "cups-paper-12oz", quantity: 1 }] }],
    ["zero quantity", { items: [{ productId: "cups-paper-12oz", quantity: 0 }] }],
    ["quantity over 99", { items: [{ productId: "cups-paper-12oz", quantity: 100 }] }],
    ["fractional quantity", { items: [{ productId: "cups-paper-12oz", quantity: 1.5 }] }],
    ["string quantity", { items: [{ productId: "cups-paper-12oz", quantity: "2" }] }],
    ["client price", { items: [{ productId: "cups-paper-12oz", quantity: 1, priceCents: 1 }] }],
    ["client total", { ...valid, totalCents: 1 }],
    ["client currency", { ...valid, currency: "EUR" }],
    ["too many lines", { items: Array.from({ length: PRODUCTS.length + 1 }, (_, i) => ({ productId: `p${i}`, quantity: 1 })) }],
    ["not an object", "cups"],
  ];
  for (const [label, body] of cases) {
    assert.equal(checkoutRequestSchema.safeParse(body).success, false, label);
  }
});

test("prices come from the server catalog in integer cents", () => {
  const cart = priceCart(valid.items);
  assert.equal(cart.totalCents, 2 * 749 + 899);
  assert.equal(cart.currency, "USD");
  assert.deepEqual(
    cart.lines.map((line) => [line.name, line.unitPriceCents, line.lineTotalCents]),
    [["Paper Cups, 12 oz", 749, 1498], ["Paper Dinner Plates, 9 in", 899, 899]],
  );
  assert.throws(() => priceCart([{ productId: "laptop", quantity: 1 }]));
});

test("order request is USD, CAPTURE, itemized by pack with a matching breakdown", () => {
  const order = buildOrderRequest(priceCart(valid.items));
  const [unit] = order.purchase_units;
  assert.equal(order.intent, "CAPTURE");
  assert.deepEqual(unit.amount, {
    currency_code: "USD",
    value: "23.97",
    breakdown: { item_total: { currency_code: "USD", value: "23.97" } },
  });
  assert.deepEqual(unit.items[0], {
    name: "Paper Cups, 12 oz (pack of 50 cups)",
    sku: "cups-paper-12oz",
    quantity: "2",
    unit_amount: { currency_code: "USD", value: "7.49" },
  });
  // No invented shipping or tax.
  assert.deepEqual(Object.keys(unit.amount.breakdown), ["item_total"]);
  assert.equal(order.payment_source.paypal.experience_context.shipping_preference, "NO_SHIPPING");
});

test("the largest possible cart still totals exactly", () => {
  const all = PRODUCTS.map((p) => ({ productId: p.id, quantity: 99 }));
  const cart = priceCart(all);
  const order = buildOrderRequest(cart);
  const itemSum = order.purchase_units[0].items.reduce(
    (sum, item) => sum + valueToCents(item.unit_amount.value)! * Number(item.quantity),
    0,
  );
  assert.equal(itemSum, cart.totalCents);
  assert.equal(valueToCents(order.purchase_units[0].amount.value), cart.totalCents);
});

test("cent/value conversions are exact and strict", () => {
  assert.equal(centsToValue(0), "0.00");
  assert.equal(centsToValue(5), "0.05");
  assert.equal(centsToValue(123456), "1234.56");
  assert.throws(() => centsToValue(1.5));
  assert.equal(valueToCents("23.97"), 2397);
  assert.equal(valueToCents("10"), 1000);
  assert.equal(valueToCents("10.5"), 1050);
  for (const bad of ["", "1.234", "-1.00", "1e3", " 1.00", 12, null]) {
    assert.equal(valueToCents(bad), null, String(bad));
  }
});
