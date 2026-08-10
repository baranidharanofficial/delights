/**
 * Domain types shared by the server data layer and the client terminal.
 *
 * Deliberately free of any `firebase-admin` import: this module is pulled into
 * the client bundle, and Firestore `Timestamp` objects do not survive the
 * Server → Client boundary. Times cross as epoch milliseconds instead.
 */

import type { Unit } from "./units";

export type Category = {
  id: string;
  name: string;
  sortOrder: number;
};

export type MenuItem = {
  id: string;
  name: string;
  /** Minor units (paise). Money stays integral — never float. */
  price: number;
  categoryId: string;
  /** Manually taken off the menu, independent of stock. */
  available: boolean;
  /** Units on hand, or `null` when this item is not stock-tracked. */
  stock: number | null;
  sortOrder: number;
  /** Storage object key, served through `/api/images`. `null` when unset. */
  imageKey: string | null;
};

export const PAYMENT_METHODS = ["Cash", "Card", "UPI"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return PAYMENT_METHODS.includes(value as PaymentMethod);
}

/**
 * A line as it was at the moment of sale. Name and price are copied, not
 * referenced: renaming an item or repricing it must never rewrite the history of
 * what a customer actually paid.
 */
export type OrderLine = {
  itemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type Order = {
  id: string;
  /** Zero-padded, unique within `businessDate` — displayed as `#0007`. */
  reference: string;
  /** `YYYY-MM-DD` in IST. The day the shop counts this sale against. */
  businessDate: string;
  placedAtMs: number;
  lines: OrderLine[];
  subtotal: number;
  tax: number;
  /** Snapshotted alongside the amount so old orders survive a rate change. */
  taxRate: number;
  taxLabel: string;
  total: number;
  method: PaymentMethod;
  cashier: { email: string; name: string | null };
};

/** What the terminal sends to the server: ids and counts, never prices. */
export type OrderRequestLine = {
  itemId: string;
  quantity: number;
};

// --- Raw materials ----------------------------------------------------------

/**
 * A raw material — flour, butter, cups.
 *
 * Valued at moving average: `stockValue` is what the `stock` on hand cost, so a
 * unit price is `stockValue / stock` rather than a stored rate. Receipts at a
 * new price blend in automatically, and every *stored* money figure stays a
 * whole number of paise.
 */
export type Material = {
  id: string;
  name: string;
  unit: Unit;
  /** Whole base units on hand (g, ml, or pieces). */
  stock: number;
  /** Paise. What the stock on hand is currently valued at. */
  stockValue: number;
  /** Warn at or below this, in base units. `null` disables the alert. */
  reorderLevel: number | null;
  sortOrder: number;
  /** Storage object key, served through `/api/images`. `null` when unset. */
  imageKey: string | null;
};

export function isLowStock(material: Material): boolean {
  return material.reorderLevel !== null && material.stock <= material.reorderLevel;
}

/** Base units of one material consumed by a single batch. */
export type RecipeLine = {
  materialId: string;
  quantity: number;
};

/**
 * What one batch of a menu item consumes and yields.
 *
 * Held per batch rather than per finished unit because that is how baking
 * actually works — one tray, one tin, one pot. Producing a number of units that
 * is not a whole multiple of the yield scales the lines proportionally.
 */
export type Recipe = {
  /** Same id as the menu item it produces. */
  menuItemId: string;
  /** Finished units one batch yields. */
  batchYield: number;
  lines: RecipeLine[];
};

export const MOVEMENT_KINDS = [
  "receipt",
  "wastage",
  "count",
  "production",
] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export function isMovementKind(value: unknown): value is MovementKind {
  return MOVEMENT_KINDS.includes(value as MovementKind);
}

export const MOVEMENT_LABELS: Record<MovementKind, string> = {
  receipt: "Received",
  wastage: "Wasted",
  count: "Count adjustment",
  production: "Used in production",
};

/**
 * One entry in the material ledger. Every change to `Material.stock` writes one,
 * so the current figure is always explainable.
 */
export type MaterialMovement = {
  id: string;
  materialId: string;
  materialName: string;
  unit: Unit;
  kind: MovementKind;
  /** Signed base units — positive into the store, negative out. */
  quantity: number;
  /** Signed paise, moving with the quantity. */
  value: number;
  note: string | null;
  businessDate: string;
  atMs: number;
  by: { email: string; name: string | null };
};

/** A material consumed by one production run, snapshotted at the time. */
export type ProductionLine = {
  materialId: string;
  name: string;
  unit: Unit;
  quantity: number;
  cost: number;
};

export type Production = {
  id: string;
  menuItemId: string;
  itemName: string;
  /** Finished units added to the menu item's stock. */
  quantity: number;
  lines: ProductionLine[];
  totalCost: number;
  businessDate: string;
  producedAtMs: number;
  by: { email: string; name: string | null };
};

export type DailyReport = {
  businessDate: string;
  orderCount: number;
  grossSubtotal: number;
  grossTax: number;
  grossTotal: number;
  byMethod: Record<PaymentMethod, { count: number; total: number }>;
  /** Descending by units sold. */
  topItems: { itemId: string; name: string; quantity: number; total: number }[];
};
