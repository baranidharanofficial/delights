"use server";

import { revalidatePath } from "next/cache";

import { requirePosUser } from "@/lib/auth/session";
import { isBusinessDate } from "@/lib/shop/dates";
import {
  createExpense,
  deleteExpense,
  updateExpense,
  type Actor,
  type ExpenseInput,
} from "@/lib/shop/expenses";
import { parseRupees } from "@/lib/shop/money";
import { isExpenseCategory, isExpenseMethod } from "@/lib/shop/types";

import { EMPTY_FORM_STATE, type FormState } from "../form-state";

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

async function actor(): Promise<Actor> {
  const user = await requirePosUser();
  return { email: user.email, name: user.name };
}

/**
 * One entry, as typed.
 *
 * The amount arrives as rupees and is parsed to paise here — the same one-way
 * conversion the menu editor does, so nothing downstream ever sees a float.
 */
function readInput(formData: FormData): ExpenseInput | { error: string } {
  const amount = parseRupees(text(formData, "amount"));
  if (amount === null) {
    return { error: "Enter the amount, like 450 or 450.50." };
  }

  const category = text(formData, "category");
  if (!isExpenseCategory(category)) return { error: "Pick a category." };

  const method = text(formData, "method");
  if (!isExpenseMethod(method)) return { error: "Pick how it was paid." };

  const description = text(formData, "description");
  if (description === "") return { error: "Say what the money went on." };

  const businessDate = text(formData, "businessDate");
  if (!isBusinessDate(businessDate)) {
    return { error: "Pick the date the money went out." };
  }

  return {
    amount,
    category,
    method,
    description,
    vendor: text(formData, "vendor") || null,
    businessDate,
  };
}

/**
 * Revalidates the month the entry belongs to as well as the one on screen.
 *
 * Backdating a payment into last month moves it off the page it was typed on,
 * and a stale cached copy of the month it landed in would go on reporting a
 * total it no longer has.
 */
function refresh(month: string) {
  revalidatePath("/pos/expenses");
  if (month !== "") revalidatePath(`/pos/expenses?month=${month}`);
}

export async function addExpense(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const who = await actor();

  const input = readInput(formData);
  if ("error" in input) return input;

  const result = await createExpense(input, who);
  if (!result.ok) return { error: result.error };

  refresh(input.businessDate.slice(0, 7));
  return EMPTY_FORM_STATE;
}

export async function saveExpense(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePosUser();

  const id = text(formData, "id");
  if (id === "") return { error: "Nothing to save." };

  const input = readInput(formData);
  if ("error" in input) return input;

  const result = await updateExpense(id, input);
  if (!result.ok) return { error: result.error };

  refresh(input.businessDate.slice(0, 7));
  return EMPTY_FORM_STATE;
}

export async function removeExpense(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePosUser();

  const id = text(formData, "id");
  if (id === "") return { error: "Nothing to delete." };

  const result = await deleteExpense(id);
  if (!result.ok) return { error: result.error };

  refresh(text(formData, "month"));
  return EMPTY_FORM_STATE;
}
