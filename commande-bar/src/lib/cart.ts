"use client";

import { useLocalState } from "@/lib/local-store";
import { MAX_QUANTITY_PER_LINE } from "@/lib/order-types";

/** Panier : identifiant du produit → quantité. */
export type Cart = Record<string, number>;

export type RecentOrder = { id: string; number: number; at: number };

const EMPTY_CART: Cart = {};
const NO_ORDERS: RecentOrder[] = [];
const RECENT_ORDER_MAX_AGE = 6 * 60 * 60 * 1000; // 6 heures

function validateCart(value: unknown): Cart {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_CART;
  const cart: Cart = {};
  for (const [id, quantity] of Object.entries(value)) {
    if (Number.isInteger(quantity) && (quantity as number) > 0) {
      cart[id] = Math.min(quantity as number, MAX_QUANTITY_PER_LINE);
    }
  }
  return cart;
}

function validateRecentOrders(value: unknown): RecentOrder[] {
  if (!Array.isArray(value)) return NO_ORDERS;
  const now = Date.now();
  return value.filter(
    (order): order is RecentOrder =>
      typeof order?.id === "string" &&
      typeof order?.number === "number" &&
      typeof order?.at === "number" &&
      now - order.at < RECENT_ORDER_MAX_AGE,
  );
}

export function useCart(token: string) {
  return useLocalState(`panier:${token}`, EMPTY_CART, validateCart);
}

export function useRecentOrders(token: string) {
  return useLocalState(`commandes:${token}`, NO_ORDERS, validateRecentOrders);
}
