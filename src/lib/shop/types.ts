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

/**
 * Why a sale was cancelled, and what was done about the goods.
 *
 * A voided order is never deleted and its receipt number is never reissued — the
 * gap in the sequence is the evidence that something was cancelled, which is
 * exactly what makes the day auditable.
 */
export type VoidRecord = {
  atMs: number;
  by: { email: string; name: string | null };
  reason: string;
  /**
   * Whether the items went back on the shelf. False when the goods left with
   * the customer anyway — a complaint refunded rather than a misring.
   */
  stockRestored: boolean;
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
  /** `null` on a live sale. Present means the order no longer counts. */
  voided: VoidRecord | null;
};

export function isVoided(order: Order): boolean {
  return order.voided !== null;
}

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

/**
 * A hand correction to a menu item's finished count.
 *
 * The other three ways finished stock moves each leave their own record — a
 * sale in `orders`, a bake in `productions`, a cancellation in the order's void
 * block. This covers the fourth, which is the only one with nothing behind it.
 */
export type StockAdjustment = {
  id: string;
  itemId: string;
  itemName: string;
  /** Count before. `null` means the item was not being counted. */
  previous: number | null;
  /** Count after. `null` means counting was stopped. */
  next: number | null;
  /**
   * Units gained or lost. `null` when counting started or stopped, because
   * declaring a baseline is not the same as goods moving.
   */
  delta: number | null;
  note: string | null;
  businessDate: string;
  atMs: number;
  by: { email: string; name: string | null };
};

/** How an adjustment reads in a list. */
export function describeAdjustment(adjustment: StockAdjustment): string {
  const { previous, next, delta } = adjustment;

  if (previous === null) return `Started counting at ${next}`;
  if (next === null) return `Stopped counting (was ${previous})`;
  return `${previous} → ${next} (${delta !== null && delta > 0 ? "+" : ""}${delta})`;
}

export type DailyReport = {
  businessDate: string;
  /** Live sales only — voided orders are excluded from every total below. */
  orderCount: number;
  grossSubtotal: number;
  grossTax: number;
  grossTotal: number;
  byMethod: Record<PaymentMethod, { count: number; total: number }>;
  /** Descending by units sold. */
  topItems: { itemId: string; name: string; quantity: number; total: number }[];
  /** Reported alongside rather than folded in, so the day still reconciles. */
  voidedCount: number;
  voidedTotal: number;
};

// --- Tasks ------------------------------------------------------------------

/**
 * The board's columns, in the order they are drawn. A task's status *is* the
 * column it sits in — there is no separate "which lane" field to fall out of
 * step with it.
 */
export const TASK_STATUSES = ["todo", "doing", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export function isTaskStatus(value: unknown): value is TaskStatus {
  return TASK_STATUSES.includes(value as TaskStatus);
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  doing: "In progress",
  done: "Done",
};

export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export function isTaskPriority(value: unknown): value is TaskPriority {
  return TASK_PRIORITIES.includes(value as TaskPriority);
}

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

/**
 * A card on the shop's board — "order more butter", "fix the second oven".
 *
 * `assignee` is free text rather than a reference to a user. The allowlist that
 * grants POS access holds a handful of addresses, and half the people a task
 * gets handed to (the electrician, the landlord) will never sign in at all.
 */
export type Task = {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string | null;
  /** `YYYY-MM-DD` in IST, or `null` when nothing is riding on a date. */
  dueDate: string | null;
  /** Position within its column. Rewritten to contiguous steps on every move. */
  sortOrder: number;
  createdAtMs: number;
  createdBy: { email: string; name: string | null };
  /** When it last entered `done`; `null` anywhere else. */
  completedAtMs: number | null;
};

/** Past its due date and still not finished. */
export function isOverdue(task: Task, today: string): boolean {
  return task.status !== "done" && task.dueDate !== null && task.dueDate < today;
}

// --- Expenses ---------------------------------------------------------------

export const EXPENSE_CATEGORIES = [
  "Ingredients",
  "Packaging",
  "Rent",
  "Utilities",
  "Wages",
  "Equipment",
  "Maintenance",
  "Transport",
  "Marketing",
  "Fees",
  "Other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return EXPENSE_CATEGORIES.includes(value as ExpenseCategory);
}

/**
 * How money left the business.
 *
 * Deliberately not `PaymentMethod`: money can leave straight out of the bank
 * account, which is not something that can ever happen at the till. One shared
 * list would let a sale be rung up as "Bank".
 */
export const EXPENSE_METHODS = ["Cash", "Card", "UPI", "Bank"] as const;
export type ExpenseMethod = (typeof EXPENSE_METHODS)[number];

export function isExpenseMethod(value: unknown): value is ExpenseMethod {
  return EXPENSE_METHODS.includes(value as ExpenseMethod);
}

/**
 * Money spent, recorded by hand.
 *
 * Unlike an order or a ledger row this is a plain record rather than the
 * evidence behind a running balance, so correcting one in place is honest — it
 * is the same claim about the same payment, typed properly the second time.
 */
export type Expense = {
  id: string;
  /** Paise, always positive. That it is money out is the type's whole point. */
  amount: number;
  category: ExpenseCategory;
  description: string;
  vendor: string | null;
  method: ExpenseMethod;
  /** `YYYY-MM-DD` in IST — the day the shop counts the spend against. */
  businessDate: string;
  recordedAtMs: number;
  by: { email: string; name: string | null };
};

export type ExpenseSummary = {
  month: string;
  total: number;
  count: number;
  /** Descending by amount; only categories actually used appear. */
  byCategory: { category: ExpenseCategory; total: number; count: number }[];
  byMethod: Record<ExpenseMethod, { count: number; total: number }>;
  /** Every day that had spend, ascending — the shape of the month. */
  byDate: { date: string; total: number }[];
};
