"use client";

import { useActionState, useState } from "react";

import type { Order } from "@/lib/shop/types";

import { EMPTY_FORM_STATE } from "./form-state";
import { Alert, SubmitButton } from "./form-ui";
import { deleteSale } from "./reports/actions";

/**
 * Owner-only "delete this order" control, tucked behind a two-step confirm.
 *
 * Shared by every screen that lists past orders (Reports, the terminal's
 * "Today's orders" panel, the Kitchen board) — `deleteSale` itself is what
 * enforces the owner check, so this stays the same everywhere it appears.
 */
export default function DeleteOrderForm({
  order,
  className = "",
}: {
  order: Order;
  className?: string;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [state, submit] = useActionState(deleteSale, EMPTY_FORM_STATE);

  return (
    <details className={className}>
      <summary className="cursor-pointer list-none text-[0.7rem] text-muted/60 transition-colors hover:text-red-300">
        Delete this order
      </summary>

      {confirmed ? (
        <form action={submit} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="orderId" value={order.id} />
          <span className="text-xs text-red-300">
            This permanently removes the order record. Are you sure?
          </span>
          <div className="flex gap-2">
            <SubmitButton variant="danger" size="auto">
              Yes, delete
            </SubmitButton>
            <button
              type="button"
              onClick={() => setConfirmed(false)}
              className="rounded border border-white/10 px-2 py-1 text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <Alert message={state.error} />
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmed(true)}
          className="mt-2 text-[0.7rem] text-red-400/70 hover:text-red-300"
        >
          Confirm delete →
        </button>
      )}
    </details>
  );
}
