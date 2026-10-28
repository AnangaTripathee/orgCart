"use client";

// Client-only cart store backed by localStorage. Components read it through
// useSyncExternalStore: the server snapshot is `null` ("not loaded yet"), so
// the server HTML and first client render match, and the saved cart is read
// before anything can be written back.

import { useSyncExternalStore } from "react";
import {
  addLine,
  parseSavedCart,
  removeLine,
  serializeCart,
  setLineQuantity,
  type CartLine,
} from "@/lib/cart";
import { PRODUCTS_BY_ID } from "@/lib/catalog";
import { subtractPurchased } from "@/lib/checkout-state";
import { isCheckoutLocked } from "./use-checkout";

const STORAGE_KEY = "orgcart:cart:v1";
const KNOWN_IDS: ReadonlySet<string> = new Set(PRODUCTS_BY_ID.keys());

let lines: CartLine[] | null = null;
const listeners = new Set<() => void>();

function readSavedLines(): CartLine[] {
  try {
    return parseSavedCart(window.localStorage.getItem(STORAGE_KEY), KNOWN_IDS);
  } catch {
    // Storage can be unavailable (privacy modes, blocked site data).
    return [];
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function handleStorage(event: StorageEvent) {
  // Keep multiple open tabs in sync.
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  lines = readSavedLines();
  emit();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", handleStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", handleStorage);
  };
}

function getSnapshot(): CartLine[] {
  if (lines === null) lines = readSavedLines();
  return lines;
}

function getServerSnapshot(): null {
  return null;
}

function update(change: (current: CartLine[]) => CartLine[], { force = false } = {}) {
  // The approved cart snapshot must not change under an active checkout.
  if (!force && isCheckoutLocked()) return;
  lines = change(getSnapshot());
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeCart(lines));
  } catch {
    // Keep working in memory if the cart can't be saved.
  }
  emit();
}

const actions = {
  addItem: (productId: string) => update((current) => addLine(current, productId)),
  setQuantity: (productId: string, quantity: number) =>
    update((current) => setLineQuantity(current, productId, quantity)),
  removeItem: (productId: string) =>
    update((current) => removeLine(current, productId)),
  clear: () => update(() => []),
};

/** Removes items whose payment the backend confirmed, even though checkout still holds the lock. */
export function removePurchasedItems(purchased: readonly CartLine[]) {
  update((current) => subtractPurchased(current, purchased), { force: true });
}

/** Current cart lines, for snapshotting at checkout. */
export function getCartLines(): CartLine[] {
  return getSnapshot();
}

export function useCart() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    /** False until the saved cart has been read in the browser. */
    isReady: snapshot !== null,
    lines: snapshot ?? [],
    ...actions,
  };
}
