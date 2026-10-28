// `fetch` is replaced with a mock; no request reaches PayPal.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { PayPalApiError, PayPalConfigError, captureOrder, createOrder, readPayPalConfig, type PayPalConfig } from "./paypal.ts";

const SECRET = "super-secret-value";
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

let clientCounter = 0;
const config = (): PayPalConfig => ({
  // A fresh client ID per test avoids the module's token cache.
  clientId: `client-${++clientCounter}`,
  clientSecret: SECRET,
  apiBase: "https://api-m.sandbox.paypal.com",
});

type Call = { url: string; headers: Record<string, string> };
function mockFetch(responses: (Response | Error)[]) {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), headers: init.headers as Record<string, string> });
    if (String(url).endsWith("/v1/oauth2/token")) {
      return Response.json({ access_token: "access-token-abc", expires_in: 3600 });
    }
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return calls;
}

const timeout = () => Object.assign(new Error("The operation timed out."), { name: "TimeoutError" });

test("only the sandbox API base is accepted, in any environment", () => {
  const creds = { NEXT_PUBLIC_PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret" };
  assert.equal(readPayPalConfig({ ...creds, PAYPAL_API_BASE: "https://api-m.sandbox.paypal.com/" }).apiBase, "https://api-m.sandbox.paypal.com");
  assert.equal(readPayPalConfig(creds).apiBase, "https://api-m.sandbox.paypal.com");
  for (const base of ["https://api-m.paypal.com", "https://api.paypal.com", "http://api-m.sandbox.paypal.com", "https://evil.example"]) {
    assert.throws(() => readPayPalConfig({ ...creds, PAYPAL_API_BASE: base, NODE_ENV: "production" }), PayPalConfigError, base);
  }
});

test("missing credentials produce a configuration error", () => {
  assert.throws(() => readPayPalConfig({}), /not configured/);
  assert.throws(() => readPayPalConfig({ NEXT_PUBLIC_PAYPAL_CLIENT_ID: "id" }), /not configured/);
});

test("capture retries a timeout once with the same PayPal-Request-ID", async () => {
  const calls = mockFetch([timeout(), Response.json({ id: "ORDER-1", status: "COMPLETED" })]);
  const result = await captureOrder(config(), "ORDER-1", "req-123");
  assert.equal(result.status, "COMPLETED");
  const captures = calls.filter((c) => c.url.endsWith("/capture"));
  assert.equal(captures.length, 2);
  assert.deepEqual(captures.map((c) => c.headers["PayPal-Request-ID"]), ["req-123", "req-123"]);
});

test("repeated 5xx responses surface as an uncertain error", async () => {
  mockFetch([new Response("", { status: 503 }), new Response("", { status: 503 })]);
  await assert.rejects(captureOrder(config(), "ORDER-1", "req-1"), (error: unknown) => {
    assert.ok(error instanceof PayPalApiError);
    assert.equal(error.uncertain, true);
    return true;
  });
});

test("4xx errors are definite, not retried, and sanitized", async () => {
  const calls = mockFetch([
    Response.json(
      { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "INSTRUMENT_DECLINED" }], debug_id: "dbg42", message: "x" },
      { status: 422 },
    ),
  ]);
  await assert.rejects(createOrder(config(), {}, "req-2"), (error: unknown) => {
    assert.ok(error instanceof PayPalApiError);
    assert.equal(error.uncertain, false);
    assert.equal(error.hasIssue("INSTRUMENT_DECLINED"), true);
    assert.match(error.message, /INSTRUMENT_DECLINED.*dbg42/);
    assert.doesNotMatch(error.message, new RegExp(`${SECRET}|access-token-abc`));
    return true;
  });
  assert.equal(calls.filter((c) => c.url.endsWith("/v2/checkout/orders")).length, 1);
});

test("credentials go only in the OAuth request; API calls use the bearer token", async () => {
  const calls = mockFetch([Response.json({ id: "ORDER-1", status: "CREATED" })]);
  await createOrder(config(), {}, "req-3");
  const [auth, api] = calls;
  assert.match(auth.headers.Authorization, /^Basic /);
  assert.equal(api.headers.Authorization, "Bearer access-token-abc");
  assert.equal(api.headers["PayPal-Request-ID"], "req-3");
});
