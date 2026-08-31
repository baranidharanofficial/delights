import "server-only";

import {
  FieldValue,
  Timestamp,
  type DocumentSnapshot,
} from "firebase-admin/firestore";

import { COLLECTIONS, getDb } from "@/lib/firebase/admin";

import { businessMonthBounds, isBusinessDate } from "./dates";
import {
  EXPENSE_METHODS,
  isExpenseCategory,
  isExpenseMethod,
  type Expense,
  type ExpenseSummary,
} from "./types";

export type Actor = { email: string; name: string | null };

export type ExpenseResult = { ok: true } | { ok: false; error: string };

/**
 * Money out, recorded by hand.
 *
 * Raw materials are deliberately *not* written here. Buying flour already
 * leaves a receipt in the material ledger, where it also sets what the stock on
 * hand is worth; entering it twice would inflate the month's spend by exactly
 * the value of everything the shop actually bakes with. The expenses screen
 * reads that figure back out of the ledger and shows it alongside instead, so
 * the month adds up without either record having to know about the other.
 */

function readExpense(doc: DocumentSnapshot): Expense | null {
  const data = doc.data();
  if (!data) return null;

  const { amount } = data;
  // The amount is the whole point of the record — a row without a usable one
  // would silently drag every total it appears in off by an unknown sum.
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) {
    return null;
  }
  if (!isBusinessDate(data.businessDate)) return null;

  const recordedAt = data.recordedAt;

  return {
    id: doc.id,
    amount,
    category: isExpenseCategory(data.category) ? data.category : "Other",
    description:
      typeof data.description === "string" ? data.description : "",
    vendor:
      typeof data.vendor === "string" && data.vendor !== "" ? data.vendor : null,
    method: isExpenseMethod(data.method) ? data.method : "Cash",
    businessDate: data.businessDate,
    recordedAtMs: recordedAt instanceof Timestamp ? recordedAt.toMillis() : 0,
    by: { email: String(data.by?.email ?? ""), name: data.by?.name ?? null },
  };
}

export type ExpenseInput = {
  amount: number;
  category: Expense["category"];
  description: string;
  vendor: string | null;
  method: Expense["method"];
  businessDate: string;
};

function validate(input: ExpenseInput): string | null {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    return "Amount must be more than zero.";
  }
  if (input.description.trim() === "") {
    return "Say what the money went on.";
  }
  if (!isBusinessDate(input.businessDate)) {
    return "Pick the date the money went out.";
  }
  return null;
}

export async function createExpense(
  input: ExpenseInput,
  actor: Actor,
): Promise<ExpenseResult> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  await getDb()
    .collection(COLLECTIONS.expenses)
    .add({ ...input, recordedAt: FieldValue.serverTimestamp(), by: actor });

  return { ok: true };
}

/**
 * Corrects an entry in place.
 *
 * `recordedAt` and `by` are left alone: they say who first wrote the payment
 * down, which is still true after a typo is fixed.
 */
export async function updateExpense(
  id: string,
  input: ExpenseInput,
): Promise<ExpenseResult> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const doc = getDb().collection(COLLECTIONS.expenses).doc(id);

  const snapshot = await doc.get();
  if (!snapshot.exists) return { ok: false, error: "That entry no longer exists." };

  await doc.update({ ...input, updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
}

export async function deleteExpense(id: string): Promise<ExpenseResult> {
  await getDb().collection(COLLECTIONS.expenses).doc(id).delete();
  return { ok: true };
}

/**
 * A month's entries, newest first.
 *
 * Business dates sort lexically in date order, so an inclusive range over the
 * two ends of the month is served by the single-field index Firestore already
 * maintains — no composite index to declare and deploy.
 */
export async function getExpensesForMonth(month: string): Promise<Expense[]> {
  const { first, last } = businessMonthBounds(month);

  const snapshot = await getDb()
    .collection(COLLECTIONS.expenses)
    .where("businessDate", ">=", first)
    .where("businessDate", "<=", last)
    .get();

  return snapshot.docs
    .map(readExpense)
    .filter((expense): expense is Expense => expense !== null)
    .sort(
      (a, b) =>
        b.businessDate.localeCompare(a.businessDate) ||
        b.recordedAtMs - a.recordedAtMs,
    );
}

/** Rolls a month up in one pass, the way `reports.ts` rolls a day up. */
export function summarise(month: string, expenses: Expense[]): ExpenseSummary {
  const byMethod = Object.fromEntries(
    EXPENSE_METHODS.map((method) => [method, { count: 0, total: 0 }]),
  ) as ExpenseSummary["byMethod"];

  const categories = new Map<Expense["category"], { total: number; count: number }>();
  const dates = new Map<string, number>();

  let total = 0;

  for (const expense of expenses) {
    total += expense.amount;

    byMethod[expense.method].count += 1;
    byMethod[expense.method].total += expense.amount;

    const running = categories.get(expense.category) ?? { total: 0, count: 0 };
    running.total += expense.amount;
    running.count += 1;
    categories.set(expense.category, running);

    dates.set(
      expense.businessDate,
      (dates.get(expense.businessDate) ?? 0) + expense.amount,
    );
  }

  return {
    month,
    total,
    count: expenses.length,
    byCategory: [...categories.entries()]
      .map(([category, figures]) => ({ category, ...figures }))
      .sort((a, b) => b.total - a.total),
    byMethod,
    byDate: [...dates.entries()]
      .map(([date, dateTotal]) => ({ date, total: dateTotal }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export async function getMonthlyExpenses(month: string): Promise<{
  summary: ExpenseSummary;
  expenses: Expense[];
}> {
  const expenses = await getExpensesForMonth(month);
  return { summary: summarise(month, expenses), expenses };
}
