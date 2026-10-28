import { CartLink, CartPanel } from "@/components/cart-panel";
import { CatalogBrowser } from "@/components/catalog-browser";
import { ReceiptPanel } from "@/components/receipt-panel";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="text-2xl font-bold tracking-tight">
              org<span className="text-emerald-700 dark:text-emerald-400">Cart</span>
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Plan event supplies for your student organization.
            </p>
          </div>
          <div className="lg:hidden">
            <CartLink />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <strong className="font-semibold">Demo catalog.</strong> Products and
          prices are illustrative sample data, not live retailer prices or
          real inventory.
        </div>

        <h1 className="sr-only">orgCart supply catalog</h1>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <CatalogBrowser />
          <aside className="lg:sticky lg:top-6">
            <ReceiptPanel />
            <CartPanel />
          </aside>
        </div>
      </main>
    </div>
  );
}
