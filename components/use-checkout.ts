"use client";

// Client-only store for the current checkout attempt, persisted in
// localStorage and shared across tabs so every tab locks the cart while a
// payment is in progress. Mirrors the structure of use-cart.ts.

import { useSyncExternalStore } from "react";
import {
  CANCELLABLE_PHASES,
  applySettleResult,
  isCartLocked,
  parseSavedCheckout,
  restoreCheckout,
  type CheckoutRecord,
} from "@/lib/checkout-state";
import type { SettleResult } from "@/lib/checkout";
import type { CartLine } from "@/lib/cart";

const STORAGE_KEY = "orgcart:checkout:v1";

type CheckoutState = { record: CheckoutRecord | null; notice: string | null };

let state: CheckoutState | null = null;
const listeners = new Set<() => void>();

function readSavedRecord(): CheckoutRecord | null {
  try {
    return parseSavedCheckout(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function handleStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  // Another tab owns any in-flight request, so take its record as-is.
  state = { record: readSavedRecord(), notice: null };
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

export function getCheckoutState(): CheckoutState {
  if (state === null) {
    // Restoring is a local view only; writing it back could clobber an attempt
    // that another open tab is still running.
    state = { record: restoreCheckout(readSavedRecord()), notice: null };
  }
  return state;
}

function getServerSnapshot(): null {
  return null;
}

function persist(record: CheckoutRecord | null) {
  try {
    if (record) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Keep working in memory if storage is unavailable.
  }
}

function set(record: CheckoutRecord | null, notice: string | null = null) {
  state = { record, notice };
  persist(record);
  emit();
}

/** Used by the cart store to refuse edits during checkout. */
export function isCheckoutLocked(): boolean {
  return isCartLocked(getCheckoutState().record);
}

export const checkoutActions = {
  /** Starts an attempt with a cart snapshot. Returns false if one is already active. */
  begin(items: CartLine[]): boolean {
    if (isCheckoutLocked()) return false;
    set({ phase: "creating", items: items.map(({ productId, quantity }) => ({ productId, quantity })) });
    return true;
  },
  created(orderId: string, checkoutToken: string, amountCents: number) {
    const record = getCheckoutState().record;
    if (record?.phase !== "creating") return;
    set({ ...record, phase: "approving", orderId, checkoutToken, amountCents });
  },
  /** Re-approval of a declined order (same order, new funding source). */
  reapprove() {
    const record = getCheckoutState().record;
    if (record?.phase === "declined") set({ ...record, phase: "approving", message: undefined });
  },
  capturing() {
    const record = getCheckoutState().record;
    if (record) set({ ...record, phase: "capturing", message: undefined });
  },
  settle(outcome: SettleResult) {
    const record = getCheckoutState().record;
    if (!record) return;
    const next = applySettleResult(record, outcome);
    set(next.record, next.notice ?? null);
  },
  /** Ends an attempt that cannot have taken money. */
  cancel(notice: string) {
    const record = getCheckoutState().record;
    if (record && CANCELLABLE_PHASES.includes(record.phase)) set(null, notice);
  },
  /** Explicit user override for an unresolved payment, after a warning. */
  release(notice: string) {
    set(null, notice);
  },
  dismissReceipt() {
    if (getCheckoutState().record?.phase === "completed") set(null);
  },
  clearNotice() {
    const current = getCheckoutState();
    if (current.notice) set(current.record);
  },
};

export function useCheckout() {
  const snapshot = useSyncExternalStore(subscribe, getCheckoutState, getServerSnapshot);
  return {
    isReady: snapshot !== null,
    record: snapshot?.record ?? null,
    notice: snapshot?.notice ?? null,
    locked: isCartLocked(snapshot?.record ?? null),
  };
}
