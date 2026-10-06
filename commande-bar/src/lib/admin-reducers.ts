// Mises à jour immédiates de l'écran (avant la confirmation du serveur),
// calculées comme le fera la base.

import type { AdminCategory, TableWithLink } from "@/lib/admin-types";

function swap<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export type MenuAction =
  | { type: "available"; productId: string; value: boolean }
  | { type: "move-product"; productId: string; direction: -1 | 1 }
  | { type: "move-category"; categoryId: string; direction: -1 | 1 }
  | { type: "delete-product"; productId: string }
  | { type: "delete-category"; categoryId: string }
  | { type: "rename-category"; categoryId: string; name: string };

export function menuReducer(categories: AdminCategory[], action: MenuAction): AdminCategory[] {
  switch (action.type) {
    case "available":
      return categories.map((c) => ({
        ...c,
        products: c.products.map((p) => (p.id === action.productId ? { ...p, is_available: action.value } : p)),
      }));
    case "move-product":
      return categories.map((c) => ({
        ...c,
        products: swap(c.products, c.products.findIndex((p) => p.id === action.productId), action.direction),
      }));
    case "move-category":
      return swap(categories, categories.findIndex((c) => c.id === action.categoryId), action.direction);
    case "delete-product":
      return categories.map((c) => ({ ...c, products: c.products.filter((p) => p.id !== action.productId) }));
    case "delete-category":
      return categories.filter((c) => c.id !== action.categoryId);
    case "rename-category":
      return categories.map((c) => (c.id === action.categoryId ? { ...c, name: action.name.trim() } : c));
  }
}

export type TablesAction =
  | { type: "active"; tableId: string; value: boolean }
  | { type: "move"; tableId: string; direction: -1 | 1 }
  | { type: "rename"; tableId: string; label: string }
  | { type: "delete"; tableId: string };

export function tablesReducer(tables: TableWithLink[], action: TablesAction): TableWithLink[] {
  switch (action.type) {
    case "active":
      return tables.map((t) => (t.id === action.tableId ? { ...t, is_active: action.value } : t));
    case "move":
      return swap(tables, tables.findIndex((t) => t.id === action.tableId), action.direction);
    case "rename":
      return tables.map((t) => (t.id === action.tableId ? { ...t, label: action.label.trim() } : t));
    case "delete":
      return tables.filter((t) => t.id !== action.tableId);
  }
}
