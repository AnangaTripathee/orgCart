# orgCart

orgCart helps student organizations plan event-supply purchases within a budget.

Planned workflow: **event brief → Gemini shopping plan → editable cart → PayPal sandbox checkout.**

> **Sandbox only.** orgCart's checkout uses PayPal's sandbox. No real money moves and
> no goods are shipped. The app refuses to run checkout against PayPal's live API.

## Current status: Phase 3 — PayPal sandbox checkout

What works today:

- **Demo supply catalog**: 18 sample event supplies with category filters, including "All".
- **Pack-based pricing**: every product is sold by the pack and shows its pack size.
  A cart quantity of 2 for "Paper Cups, 12 oz (50 cups per pack)" means 2 packs = 100 cups.
- **Editable cart**: add products, step pack quantities between 1 and 99, remove a line,
  or clear the cart. Line totals and the cart total are shown in USD. The cart survives a
  refresh via `localStorage` and stays in sync across tabs.
- **PayPal sandbox checkout**: a nonempty cart shows its total and a PayPal button.
  Approving payment in PayPal's sandbox window makes orgCart's server capture the
  payment, and a receipt appears with the confirmed amount, transaction (capture) ID,
  PayPal order ID, and purchased packs. The purchased items are then removed from the cart.

### How checkout stays trustworthy

- The browser sends only product IDs and pack quantities. The server validates them
  (Zod), looks up names and prices in its own catalog, and computes the total in
  integer cents. Client-supplied prices, names, currency, or totals are rejected.
- The server creates a USD `CAPTURE` order through PayPal Orders API v2 with one item per
  product (for example "Paper Cups, 12 oz (pack of 50 cups)" × 2) and a matching
  item-total breakdown. No shipping or tax is added.
- The server returns a short-lived **signed checkout token** (HMAC-SHA256) that binds the
  PayPal order ID to the validated cart snapshot, amount, currency, a capture request ID,
  and an expiry (3 hours). The capture endpoint only accepts an order ID together with a
  valid token for that order, so it can't be used to capture arbitrary orders. No database
  or server memory is needed, so this works across serverless instances.
- Before capturing, the server reads the order from PayPal and checks the ID, intent,
  amount, currency, and items against the token. It captures only an `APPROVED` order, and
  reports success only for a `COMPLETED` capture whose amount and currency match.
- Capture uses a `PayPal-Request-ID` stored in the token, so retries of the same capture
  reuse it and PayPal can deduplicate them. This reduces the risk of a double capture; it
  is not an exactly-once guarantee.
- The PayPal client secret and access tokens stay on the server. Only the public client
  ID reaches the browser.

### What you'll see in each situation

| Situation | What orgCart does |
| --- | --- |
| You close the PayPal window or cancel | Checkout ends. Your cart is unchanged and editable. |
| PayPal declines your funding source | Shows "Payment method declined". Click the PayPal button again to pick another funding source for the **same** order, or cancel. |
| Order creation fails (config, validation, PayPal error) | Shows the reason. Your cart is unchanged. |
| PayPal reports the capture as **pending** | Shows "Payment pending — not complete" with the order and capture IDs, and a **Recheck payment status** button. Not shown as paid. |
| The capture request times out or the network fails | Shows "Payment status unknown" with the order ID and a **Recheck payment status** button. The cart stays locked so you don't accidentally pay twice. The state survives a refresh. |
| You reload while PayPal's window is open | Shows "Checkout interrupted" with **Recheck** and **Cancel**. |
| Capture confirmed as completed | Shows the receipt and removes the purchased packs from the cart. |

While a checkout attempt is active, cart editing is locked in every open tab, so the
approved snapshot can't silently change. For a pending or unknown payment there is also
a "release my cart" link. Use it only after you've confirmed in the sandbox seller
account that the payment didn't complete, because checking out again could create a
second payment.

### Limitations

- **Prices are illustrative demo data**, not live retailer prices or real inventory.
- No accounts, database, order history, fulfillment, refunds, or webhooks. The last
  receipt is kept in this browser only until you click **Start a new cart**.
- Unresolved checkouts are tracked in the browser. If you clear site data during an
  unknown or pending payment, check the seller sandbox account directly.
- A checkout token expires 3 hours after the order is created. After that orgCart will
  still report an already-completed payment, but won't capture an approved one.
- No AI planning yet (planned for a later phase).

## Setup

Requires Node.js 22.18+ (Node 24 recommended; tests use Node's built-in TypeScript support).

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Variable | Where it's used | Value |
| --- | --- | --- |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Browser and server | Sandbox app **Client ID** |
| `PAYPAL_CLIENT_SECRET` | Server only | Sandbox app **Secret** |
| `PAYPAL_API_BASE` | Server only | Must be `https://api-m.sandbox.paypal.com`. Any other value is rejected, including in production builds. |
| `CHECKOUT_SIGNING_SECRET` | Server only | Random string, 32+ characters, used to sign checkout tokens |

Generate a signing secret locally:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

`.env.local` is git-ignored. Never commit it or paste its values anywhere. If PayPal
credentials or the signing secret are missing, the catalog and cart still work and
checkout shows a configuration error. `NEXT_PUBLIC_PAYPAL_CLIENT_ID` is inlined at build
time, so restart `npm run dev` (or rebuild) after changing it.

### PayPal sandbox accounts

1. Sign in at [developer.paypal.com](https://developer.paypal.com/) with your regular
   PayPal account. Using the developer dashboard is free.
2. **Apps & Credentials** (Sandbox tab): open your app, or create one, and copy the
   **Client ID** and **Secret**. The app is linked to a sandbox **Business** account,
   which is the merchant that receives orgCart's payments.
3. **Testing Tools → Sandbox Accounts**: PayPal creates a default **Business** account
   and a **Personal** (buyer) account. Use **Create account** to add one if needed. To see
   a sandbox account's email and generated password, open the account's **⋮** menu and
   choose **View/Edit account**.

## Manual sandbox checkout

1. Start the app (`npm run dev`) and add a few products to the cart.
2. Check the total and the "Sandbox demo — no real money or goods" notice, then click
   **Pay with PayPal**.
3. In the PayPal sandbox window, log in with the **Personal** sandbox account (not your
   real PayPal login, and not the Business account) and approve the payment.
4. Wait for "Payment completed in sandbox". Note the **Transaction ID** and **PayPal
   order ID**. The cart should now be empty.

To confirm the payment on the seller side, log in at
[sandbox.paypal.com](https://www.sandbox.paypal.com/) with the **Business** sandbox account
and open **Activity**. A completed payment from the Personal account for the same amount
should be listed. Open it: its transaction ID should match orgCart's Transaction ID. The Personal
account's activity shows the matching payment.

To try a cancellation, close the PayPal window before approving. The cart should be
unchanged and editable.

## Scripts

```bash
npm run lint    # ESLint
npm test        # unit tests: cart, checkout validation, token, settlement (PayPal mocked)
npm run build   # production build
```

The automated tests never call PayPal; they replace `fetch` and the PayPal client with mocks.

## Project layout

- `app/page.tsx`: the catalog and cart page.
- `app/api/paypal/create-order/route.ts`: validates the cart, prices it, creates the
  PayPal order, and returns the signed checkout token.
- `app/api/paypal/capture-order/route.ts`: verifies the token, then captures or reconciles.
- `components/catalog-browser.tsx`, `components/cart-panel.tsx`: catalog and cart UI.
- `components/checkout-panel.tsx`: PayPal JS SDK v6 button (`@paypal/react-paypal-js`) and checkout states.
- `components/receipt-panel.tsx`: the confirmed-payment receipt.
- `components/use-cart.ts`, `components/use-checkout.ts`: client stores backed by `localStorage`.
- `lib/catalog.ts`: typed demo catalog (prices in integer cents).
- `lib/cart.ts`, `lib/checkout-state.ts`: pure client cart and checkout-state helpers.
- `lib/checkout.ts`: request schema, server pricing, and the Orders API request body.
- `lib/server/`: server-only PayPal client, checkout token, and settlement logic.

## Roadmap

- Phase 1: project setup (done)
- Phase 2: catalog and editable cart (done)
- Phase 3: PayPal sandbox checkout (done)
- Next: Gemini shopping planner that turns an event brief into a cart within a budget

All services used are free; there is no paid infrastructure.
