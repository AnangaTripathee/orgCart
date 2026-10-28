// Pure cart helpers. All money values are integer US cents.
// This module has no runtime imports so it can be unit tested with `node --test`.

/** One cart line: which product, and how many packs of it. */
export type CartLine = {
  productId: string;
  quantity: number;
};

export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 99;

export function isValidQuantity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_QUANTITY &&
    value <= MAX_QUANTITY
  );
}

/** Adds one pack of a product, merging with an existing line if present. */
export function addLine(lines: readonly CartLine[], productId: string): CartLine[] {
  const existing = lines.find((line) => line.productId === productId);
  if (!existing) {
    return [...lines, { productId, quantity: MIN_QUANTITY }];
  }
  return setLineQuantity(lines, productId, existing.quantity + 1);
}

/** Sets a line's pack quantity, clamped to the allowed range. */
export function setLineQuantity(
  lines: readonly CartLine[],
  productId: string,
  quantity: number,
): CartLine[] {
  const clamped = Math.min(
    MAX_QUANTITY,
    Math.max(MIN_QUANTITY, Math.trunc(quantity)),
  );
  return lines.map((line) =>
    line.productId === productId ? { ...line, quantity: clamped } : line,
  );
}

export function removeLine(lines: readonly CartLine[], productId: string): CartLine[] {
  return lines.filter((line) => line.productId !== productId);
}

export function lineTotalCents(priceCents: number, quantity: number): number {
  return priceCents * quantity;
}

/**
 * Sums the cart using current catalog prices. Lines whose product is no longer
 * in the catalog contribute nothing.
 */
export function cartTotalCents(
  lines: readonly CartLine[],
  getPriceCents: (productId: string) => number | undefined,
): number {
  return lines.reduce((total, line) => {
    const price = getPriceCents(line.productId);
    return price === undefined ? total : total + lineTotalCents(price, line.quantity);
  }, 0);
}

/**
 * Parses a saved cart string. Anything malformed is dropped: non-JSON input,
 * non-array data, unknown product IDs, invalid quantities, and duplicate lines
 * (the first occurrence wins). Never throws.
 */
export function parseSavedCart(
  raw: string | null,
  knownProductIds: ReadonlySet<string>,
): CartLine[] {
  if (raw === null) return [];

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const lines: CartLine[] = [];
  const seen = new Set<string>();
  for (const entry of data) {
    if (typeof entry !== "object" || entry === null) continue;
    const { productId, quantity } = entry as Record<string, unknown>;
    if (typeof productId !== "string" || !knownProductIds.has(productId)) continue;
    if (!isValidQuantity(quantity) || seen.has(productId)) continue;
    seen.add(productId);
    lines.push({ productId, quantity });
  }
  return lines;
}

/** Serializes only product IDs and quantities; prices are never saved. */
export function serializeCart(lines: readonly CartLine[]): string {
  return JSON.stringify(
    lines.map(({ productId, quantity }) => ({ productId, quantity })),
  );
}
