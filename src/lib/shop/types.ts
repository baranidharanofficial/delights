/**
 * Domain types shared by the server data layer and the client terminal.
 *
 * Deliberately free of any `firebase-admin` import: this module is pulled into
 * the client bundle, and Firestore `Timestamp` objects do not survive the
 * Server → Client boundary. Times cross as epoch milliseconds instead.
 */

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
