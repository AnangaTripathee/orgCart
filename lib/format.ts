const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Formats integer US cents as a dollar string, e.g. 1299 → "$12.99". */
export function formatUSD(cents: number): string {
  return usd.format(cents / 100);
}
