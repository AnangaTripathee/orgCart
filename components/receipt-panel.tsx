"use client";

import { formatUSD } from "@/lib/format";
import { checkoutActions, useCheckout } from "./use-checkout";

export function ReceiptPanel() {
  const { record } = useCheckout();
  const receipt = record?.phase === "completed" ? record.receipt : undefined;
  if (!receipt) return null;

  return (
    <section
      aria-labelledby="receipt-heading"
      className="mb-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4 shadow-sm dark:border-emerald-800 dark:bg-emerald-950"
    >
      <h2 id="receipt-heading" className="text-xl font-semibold text-emerald-900 dark:text-emerald-100">
        Payment completed in sandbox
      </h2>
      <p className="mt-1 text-sm text-emerald-900 dark:text-emerald-200">
        PayPal sandbox confirmed this payment. No real money or goods were exchanged.
      </p>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-zinc-600 dark:text-zinc-400">Amount</dt>
        <dd className="font-semibold" data-testid="receipt-amount">
          {formatUSD(receipt.amountCents)} {receipt.currency}
        </dd>
        <dt className="text-zinc-600 dark:text-zinc-400">Transaction ID</dt>
        <dd className="break-all font-mono" data-testid="receipt-capture-id">
          {receipt.captureId}
        </dd>
        <dt className="text-zinc-600 dark:text-zinc-400">PayPal order ID</dt>
        <dd className="break-all font-mono">{receipt.orderId}</dd>
      </dl>

      <ul className="mt-3 divide-y divide-emerald-200 text-sm dark:divide-emerald-900">
        {receipt.lines.map((line) => (
          <li key={line.productId} className="flex justify-between gap-3 py-1.5">
            <span>
              {line.name}
              <span className="block text-xs text-zinc-600 dark:text-zinc-400">
                {line.quantity} {line.quantity === 1 ? "pack" : "packs"} ={" "}
                {line.quantity * line.unitsPerPack} {line.unitLabel}
              </span>
            </span>
            <span className="tabular-nums">{formatUSD(line.lineTotalCents)}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
        This receipt is kept only in this browser until you dismiss it. orgCart doesn’t store
        order history.
      </p>
      <button
        type="button"
        onClick={checkoutActions.dismissReceipt}
        className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400"
      >
        Start a new cart
      </button>
    </section>
  );
}
