"use client";

import { useActionState } from "react";

import { formatIstTime } from "@/lib/shop/dates";
import { formatMoney } from "@/lib/shop/money";
import type { Order } from "@/lib/shop/types";

import { EMPTY_FORM_STATE } from "../form-state";
import { Alert, FIELD, SubmitButton } from "../form-ui";
import { voidSale } from "./actions";

function VoidForm({ order }: { order: Order }) {
  const [state, submit] = useActionState(voidSale, EMPTY_FORM_STATE);

  return (
    <details className="mt-2">
      <summary className="cursor-pointer list-none text-[0.7rem] text-muted/60 transition-colors hover:text-red-300">
        Void this order
      </summary>

      <form action={submit} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="orderId" value={order.id} />
        <input
          name="reason"
          placeholder="Reason (required) — wrong item, customer left…"
          aria-label={`Reason for voiding order ${order.reference}`}
          className={`${FIELD} min-w-0 flex-[2]`}
        />
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            name="restoreStock"
            defaultChecked
            className="accent-accent"
          />
          Back to stock
        </label>
        <SubmitButton variant="danger" size="auto">
          Void
        </SubmitButton>
      </form>

      <p className="mt-1 text-[0.7rem] text-muted/60">
        Untick if the customer kept the goods — a refund rather than a misring.
        The receipt number stays used either way.
      </p>
      <Alert message={state.error} />
    </details>
  );
}

function OrderRow({ order }: { order: Order }) {
  const voided = order.voided;

  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className={`font-medium ${voided ? "text-muted line-through" : ""}`}>
          #{order.reference}
        </span>
        <span className="text-xs text-muted">
          {formatIstTime(order.placedAtMs)} · {order.method}
        </span>
        {voided && (
          <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[0.65rem] font-medium text-red-300">
            Voided
          </span>
        )}
        <span
          className={`ml-auto font-semibold tabular-nums ${
            voided ? "text-muted line-through" : "text-accent"
          }`}
        >
          {formatMoney(order.total)}
        </span>
      </div>

      <p className="mt-1 truncate text-xs text-muted">
        {order.lines.map((line) => `${line.quantity} × ${line.name}`).join(", ")}
      </p>

      {voided ? (
        <p className="mt-1 text-[0.7rem] text-muted/70">
          {voided.reason} · voided by {voided.by.name ?? voided.by.email} at{" "}
          {formatIstTime(voided.atMs)} ·{" "}
          {voided.stockRestored ? "returned to stock" : "not returned to stock"}
        </p>
      ) : (
        <VoidForm order={order} />
      )}
    </li>
  );
}

export default function OrderList({ orders }: { orders: Order[] }) {
  if (orders.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-muted">
        No orders recorded yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-white/[0.06] px-5">
      {orders.map((order) => (
        <OrderRow key={order.id} order={order} />
      ))}
    </ul>
  );
}
