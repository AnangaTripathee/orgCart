import "server-only";

// Minimal PayPal REST client for this app's single sandbox merchant.
// Credentials and access tokens never leave the server, and are never logged.

export const SANDBOX_API_BASE = "https://api-m.sandbox.paypal.com";
const REQUEST_TIMEOUT_MS = 15_000;

export type PayPalConfig = { clientId: string; clientSecret: string; apiBase: string };

export class PayPalConfigError extends Error {}

/** Reads sandbox credentials. Any non-sandbox API base is rejected, in every environment. */
export function readPayPalConfig(env: Record<string, string | undefined> = process.env): PayPalConfig {
  const clientId = env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim();
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim();
  const apiBase = (env.PAYPAL_API_BASE?.trim() || SANDBOX_API_BASE).replace(/\/+$/, "");
  if (!clientId || !clientSecret) {
    throw new PayPalConfigError(
      "PayPal sandbox is not configured. Set NEXT_PUBLIC_PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.",
    );
  }
  if (apiBase !== SANDBOX_API_BASE) {
    throw new PayPalConfigError(
      `orgCart only supports the PayPal sandbox. PAYPAL_API_BASE must be ${SANDBOX_API_BASE}.`,
    );
  }
  return { clientId, clientSecret, apiBase };
}

/**
 * A failed PayPal call. `message` is safe to show: it contains PayPal's error
 * name/issue and debug ID, never credentials, tokens, or raw bodies.
 * `uncertain` is true when the request may have been processed (timeout,
 * network failure, 5xx), so the outcome must be reconciled, not assumed.
 */
export class PayPalApiError extends Error {
  readonly status: number | null;
  readonly errorName: string;
  readonly issues: readonly string[];
  readonly debugId: string | null;
  readonly uncertain: boolean;

  constructor(
    message: string,
    status: number | null,
    errorName: string,
    issues: readonly string[],
    debugId: string | null,
    uncertain: boolean,
  ) {
    super(message);
    this.status = status;
    this.errorName = errorName;
    this.issues = issues;
    this.debugId = debugId;
    this.uncertain = uncertain;
  }

  hasIssue(issue: string): boolean {
    return this.issues.includes(issue);
  }
}

type PayPalErrorBody = {
  name?: unknown;
  message?: unknown;
  debug_id?: unknown;
  details?: { issue?: unknown }[];
  error?: unknown;
};

async function toApiError(response: Response, operation: string): Promise<PayPalApiError> {
  let body: PayPalErrorBody = {};
  try {
    body = (await response.json()) as PayPalErrorBody;
  } catch {
    // Non-JSON error body; fall back to the status code.
  }
  const name =
    typeof body.name === "string" ? body.name : typeof body.error === "string" ? body.error : "HTTP_ERROR";
  const issues = (Array.isArray(body.details) ? body.details : [])
    .map((detail) => detail?.issue)
    .filter((issue): issue is string => typeof issue === "string");
  const debugId = typeof body.debug_id === "string" ? body.debug_id : null;
  const summary = [name, ...issues].join(": ");
  return new PayPalApiError(
    `PayPal ${operation} failed (${response.status} ${summary}${debugId ? `, debug ID ${debugId}` : ""}).`,
    response.status,
    name,
    issues,
    debugId,
    response.status >= 500,
  );
}

function networkError(operation: string, error: unknown): PayPalApiError {
  const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
  return new PayPalApiError(
    timedOut ? `PayPal ${operation} timed out.` : `Could not reach PayPal for ${operation}.`,
    null,
    timedOut ? "TIMEOUT" : "NETWORK_ERROR",
    [],
    null,
    true,
  );
}

let cachedToken: { key: string; token: string; expiresAt: number } | null = null;

async function getAccessToken(config: PayPalConfig): Promise<string> {
  const key = `${config.apiBase}|${config.clientId}`;
  if (cachedToken && cachedToken.key === key && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }
  let response: Response;
  try {
    response = await fetch(`${config.apiBase}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw networkError("authentication", error);
  }
  if (!response.ok) throw await toApiError(response, "authentication");
  const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string") {
    throw new PayPalApiError("PayPal authentication returned no token.", response.status, "INVALID_RESPONSE", [], null, false);
  }
  const lifetimeSeconds = typeof body.expires_in === "number" ? body.expires_in : 300;
  // Refresh a minute early so a token never expires mid-request.
  cachedToken = { key, token: body.access_token, expiresAt: Date.now() + Math.max(0, lifetimeSeconds - 60) * 1000 };
  return body.access_token;
}

type RequestOptions = {
  method: "GET" | "POST";
  path: string;
  operation: string;
  body?: unknown;
  /** Sent as PayPal-Request-ID. Retries reuse it so PayPal can deduplicate. */
  requestId?: string;
};

/** Calls the Orders API, retrying once on timeouts, network errors, and 5xx. */
async function paypalRequest<T>(config: PayPalConfig, options: RequestOptions): Promise<T> {
  let lastError: PayPalApiError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAccessToken(config);
    let response: Response;
    try {
      response = await fetch(`${config.apiBase}${options.path}`, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
          ...(options.requestId ? { "PayPal-Request-ID": options.requestId } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = networkError(options.operation, error);
      continue;
    }
    if (response.ok) return (await response.json()) as T;
    lastError = await toApiError(response, options.operation);
    if (response.status === 401 && attempt === 0) {
      // Token revoked or expired early: fetch a fresh one and retry once.
      cachedToken = null;
      continue;
    }
    if (!lastError.uncertain) throw lastError;
  }
  throw lastError!;
}

// The subset of the Orders v2 representation that orgCart reads.
export type PayPalMoney = { currency_code?: string; value?: string };
export type PayPalCapture = {
  id?: string;
  status?: string;
  amount?: PayPalMoney;
  status_details?: { reason?: string };
};
export type PayPalOrder = {
  id?: string;
  status?: string;
  intent?: string;
  purchase_units?: {
    amount?: PayPalMoney & { breakdown?: { item_total?: PayPalMoney } };
    items?: { sku?: string; quantity?: string; unit_amount?: PayPalMoney }[];
    payments?: { captures?: PayPalCapture[] };
  }[];
};

export function createOrder(config: PayPalConfig, body: unknown, requestId: string) {
  return paypalRequest<PayPalOrder>(config, {
    method: "POST",
    path: "/v2/checkout/orders",
    operation: "order creation",
    body,
    requestId,
  });
}

export function getOrder(config: PayPalConfig, orderId: string) {
  return paypalRequest<PayPalOrder>(config, {
    method: "GET",
    path: `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    operation: "order lookup",
  });
}

export function captureOrder(config: PayPalConfig, orderId: string, requestId: string) {
  return paypalRequest<PayPalOrder>(config, {
    method: "POST",
    path: `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    operation: "capture",
    body: {},
    requestId,
  });
}
