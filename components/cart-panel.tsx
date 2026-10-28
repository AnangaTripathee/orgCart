"use client";

import { MAX_QUANTITY, MIN_QUANTITY, cartTotalCents, lineTotalCents } from "@/lib/cart";
import { PRODUCTS_BY_ID } from "@/lib/catalog";
import { formatUSD } from "@/lib/format";
import { CheckoutPanel } from "./checkout-panel";
import { useCart } from "./use-cart";
import { useCheckout } from "./use-checkout";

const getPriceCents = (productId: string) =>
  PRODUCTS_BY_ID.get(productId)?.priceCents;

const stepButton =
  "flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 text-lg leading-none hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:border-zinc-700 dark:hover:bg-zinc-800";

export function CartPanel() {
  const { isReady, lines, setQuantity, removeItem, clear } = useCart();
  const checkout = useCheckout();
  const locked = checkout.locked;
  const totalCents = cartTotalCents(lines, getPriceCents);
  const totalPacks = lines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <section
      id="cart"
      aria-labelledby="cart-heading"
      className="scroll-mt-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="cart-heading" className="text-xl font-semibold">
          Your cart
        </h2>
        {lines.length > 0 && (
          <button
            type="button"
            onClick={clear}
            disabled={locked}
            className="text-sm font-medium text-red-700 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline dark:text-red-400"
          >
            Clear cart
          </button>
        )}
      </div>

      {locked && (
        <p className="mt-3 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          Cart editing is locked while this checkout is in progress.
        </p>
      )}

      {!isReady ? (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Loading saved cart…
        </p>
      ) : lines.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
          <p className="font-medium">Your cart is empty.</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Choose “Add to cart” on any product to start planning. Each click
            adds one pack.
          </p>
        </div>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
            {lines.map((line) => {
              const product = PRODUCTS_BY_ID.get(line.productId);
              if (!product) return null;
              const totalUnits = product.unitsPerPack * line.quantity;
              return (
                <li key={line.productId} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium leading-snug">{product.name}</p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {formatUSD(product.priceCents)} per pack ·{" "}
                        {product.unitsPerPack} {product.unitLabel} per pack
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums">
                      {formatUSD(lineTotalCents(product.priceCents, line.quantity))}
                    </p>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">
                        Packs
                      </span>
                      <button
                        type="button"
                        className={stepButton}
                        aria-label={`Remove one pack of ${product.name}`}
                        disabled={locked || line.quantity <= MIN_QUANTITY}
                        onClick={() => setQuantity(line.productId, line.quantity - 1)}
                      >
                        −
                      </button>
                      <span
                        className="w-6 text-center font-medium tabular-nums"
                        aria-live="polite"
                      >
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        className={stepButton}
                        aria-label={`Add one pack of ${product.name}`}
                        disabled={locked || line.quantity >= MAX_QUANTITY}
                        onClick={() => setQuantity(line.productId, line.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(line.productId)}
                      disabled={locked}
                      className="text-sm text-zinc-600 underline-offset-2 hover:text-red-700 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline dark:text-zinc-400 dark:hover:text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {line.quantity} {line.quantity === 1 ? "pack" : "packs"} ={" "}
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {totalUnits} {product.unitLabel}
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>

          <div className="mt-2 flex items-baseline justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Total ({totalPacks} {totalPacks === 1 ? "pack" : "packs"})
            </p>
            <p className="text-xl font-bold tabular-nums" data-testid="cart-total">
              {formatUSD(totalCents)}
            </p>
          </div>
        </>
      )}

      {isReady && checkout.isReady && (lines.length > 0 || locked) && (
        <CheckoutPanel cartTotalCents={totalCents} />
      )}
    </section>
  );
}

export function CartLink() {
  const { isReady, lines } = useCart();
  const packs = lines.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <a
      href="#cart"
      className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
    >
      Cart{isReady ? ` · ${packs} ${packs === 1 ? "pack" : "packs"}` : ""}
    </a>
  );
}
