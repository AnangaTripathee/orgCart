"use client";

import { useState } from "react";
import { CATEGORIES, PRODUCTS, type Category } from "@/lib/catalog";
import { formatUSD } from "@/lib/format";
import { MAX_QUANTITY } from "@/lib/cart";
import { useCart } from "./use-cart";
import { useCheckout } from "./use-checkout";

type Filter = Category | "All";

const FILTERS: readonly Filter[] = ["All", ...CATEGORIES];

export function CatalogBrowser() {
  const [filter, setFilter] = useState<Filter>("All");
  const { isReady, lines, addItem } = useCart();
  const { locked } = useCheckout();

  const visibleProducts =
    filter === "All"
      ? PRODUCTS
      : PRODUCTS.filter((product) => product.category === filter);

  return (
    <section aria-labelledby="catalog-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="catalog-heading" className="text-xl font-semibold">
          Supply catalog
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {visibleProducts.length}{" "}
          {visibleProducts.length === 1 ? "product" : "products"}
        </p>
      </div>

      <div
        role="group"
        aria-label="Filter by category"
        className="mt-4 flex flex-wrap gap-2"
      >
        {FILTERS.map((option) => {
          const isActive = option === filter;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={isActive}
              onClick={() => setFilter(option)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border-emerald-700 bg-emerald-700 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-zinc-950"
                  : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visibleProducts.map((product) => {
          const inCart =
            lines.find((line) => line.productId === product.id)?.quantity ?? 0;
          return (
            <li
              key={product.id}
              className="flex flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                {product.category}
              </p>
              <h3 className="mt-1 font-semibold leading-snug">{product.name}</h3>
              <p className="mt-1 flex-1 text-sm text-zinc-600 dark:text-zinc-400">
                {product.description}
              </p>
              <div className="mt-4">
                <p className="text-lg font-semibold">
                  {formatUSD(product.priceCents)}
                  <span className="text-sm font-normal text-zinc-600 dark:text-zinc-400">
                    {" "}
                    per pack
                  </span>
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {product.unitsPerPack} {product.unitLabel} per pack
                </p>
                <button
                  type="button"
                  onClick={() => addItem(product.id)}
                  disabled={!isReady || locked || inCart >= MAX_QUANTITY}
                  className="mt-3 w-full rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400"
                >
                  Add to cart
                </button>
              </div>
              <p
                className="mt-2 h-5 text-xs text-zinc-600 dark:text-zinc-400"
                aria-live="polite"
              >
                {inCart > 0 &&
                  `In cart: ${inCart} ${inCart === 1 ? "pack" : "packs"} (${
                    inCart * product.unitsPerPack
                  } ${product.unitLabel})`}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
