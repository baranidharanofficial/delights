"use client";

import { useActionState, useState } from "react";

import { formatDayMonth } from "@/lib/shop/dates";
import { formatMoney, toRupeeInput } from "@/lib/shop/money";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_METHODS,
  type Expense,
} from "@/lib/shop/types";

import { EMPTY_FORM_STATE } from "../form-state";
import { Alert, FIELD, SubmitButton } from "../form-ui";
import { addExpense, removeExpense, saveExpense } from "./actions";

/**
 * The fields of one entry, shared by the add form and the row editor.
 *
 * One definition rather than two so a category added to the list can never
 * appear in the form that creates entries but not in the one that corrects
 * them.
 */
function Fields({
  expense,
  defaultDate,
}: {
  expense?: Expense;
  defaultDate: string;
}) {
  return (
    <>
      <input
        type="date"
        name="businessDate"
        defaultValue={expense?.businessDate ?? defaultDate}
        aria-label="Date paid"
        className={`${FIELD} min-w-0 basis-36`}
      />
      <select
        name="category"
        defaultValue={expense?.category ?? "Ingredients"}
        aria-label="Category"
        className={`${FIELD} min-w-0 basis-32`}
      >
        {EXPENSE_CATEGORIES.map((category) => (
          <option key={category} value={category} className="bg-background">
            {category}
          </option>
        ))}
      </select>
      <input
        name="description"
        defaultValue={expense?.description}
        placeholder="What it went on…"
        aria-label="Description"
        className={`${FIELD} min-w-0 flex-[2] basis-48`}
      />
      <input
        name="vendor"
        defaultValue={expense?.vendor ?? ""}
        placeholder="Paid to…"
        aria-label="Vendor"
        className={`${FIELD} min-w-0 flex-1 basis-32`}
      />
      <input
        name="amount"
        defaultValue={expense ? toRupeeInput(expense.amount) : ""}
        placeholder="₹ amount"
        inputMode="decimal"
        aria-label="Amount"
        className={`${FIELD} min-w-0 basis-28 text-right tabular-nums`}
      />
      <select
        name="method"
        defaultValue={expense?.method ?? "Cash"}
        aria-label="Paid by"
        className={`${FIELD} min-w-0 basis-24`}
      >
        {EXPENSE_METHODS.map((method) => (
          <option key={method} value={method} className="bg-background">
            {method}
          </option>
        ))}
      </select>
    </>
  );
}

function NewExpenseForm({ defaultDate }: { defaultDate: string }) {
  const [state, submit] = useActionState(addExpense, EMPTY_FORM_STATE);

  return (
    <div className="border-b border-white/10 px-5 py-3">
      <form action={submit} className="flex flex-wrap items-center gap-2">
        <Fields defaultDate={defaultDate} />
        <SubmitButton variant="primary" size="auto">
          Add
        </SubmitButton>
      </form>
      <Alert message={state.error} />
      <p className="mt-2 text-[0.7rem] text-muted/70">
        Raw materials belong in Inventory → Receive, not here. That records the
        same money and also values the stock it bought — entering it in both
        places would count it twice.
      </p>
    </div>
  );
}

function Editor({ expense, month }: { expense: Expense; month: string }) {
  const [saveState, save] = useActionState(saveExpense, EMPTY_FORM_STATE);
  const [deleteState, remove] = useActionState(removeExpense, EMPTY_FORM_STATE);

  return (
    <div className="mt-2 border-t border-white/[0.06] pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <form
          action={save}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
        >
          <input type="hidden" name="id" value={expense.id} />
          <Fields expense={expense} defaultDate={expense.businessDate} />
          <SubmitButton size="auto">Save</SubmitButton>
        </form>
        <form action={remove}>
          <input type="hidden" name="id" value={expense.id} />
          <input type="hidden" name="month" value={month} />
          <SubmitButton
            variant="danger"
            size="auto"
            label={`Delete ${expense.description}`}
          >
            Delete
          </SubmitButton>
        </form>
      </div>
      <Alert message={saveState.error ?? deleteState.error} />
      <p className="mt-2 text-[0.7rem] text-muted/60">
        Recorded by {expense.by.name ?? (expense.by.email || "someone")}
      </p>
    </div>
  );
}

function Row({ expense, month }: { expense: Expense; month: string }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="py-2.5">
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        className="flex w-full items-baseline gap-3 text-left text-sm"
      >
        <span className="w-20 shrink-0 text-xs text-muted tabular-nums">
          {formatDayMonth(expense.businessDate)}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {expense.description}
          {expense.vendor && (
            <span className="text-muted"> · {expense.vendor}</span>
          )}
        </span>
        <span className="hidden shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[0.65rem] text-muted sm:inline">
          {expense.category}
        </span>
        <span className="hidden w-12 shrink-0 text-right text-xs text-muted sm:inline">
          {expense.method}
        </span>
        <span className="w-24 shrink-0 text-right font-medium tabular-nums">
          {formatMoney(expense.amount)}
        </span>
      </button>

      {open && <Editor expense={expense} month={month} />}
    </li>
  );
}

export default function ExpenseList({
  expenses,
  month,
  defaultDate,
}: {
  expenses: Expense[];
  month: string;
  /** What a new entry is dated — today, or the month being viewed. */
  defaultDate: string;
}) {
  return (
    <section
      aria-label="Expenses"
      className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03]"
    >
      <h2 className="border-b border-white/10 px-5 py-3 text-sm font-semibold tracking-wide">
        Entries
      </h2>

      <NewExpenseForm defaultDate={defaultDate} />

      {expenses.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">
          Nothing recorded for this month.
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06] px-5">
          {expenses.map((expense) => (
            <Row key={expense.id} expense={expense} month={month} />
          ))}
        </ul>
      )}
    </section>
  );
}
