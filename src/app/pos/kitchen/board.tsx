"use client";

import {
  useActionState,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";

import { formatIstTime } from "@/lib/shop/dates";
import { formatMoney } from "@/lib/shop/money";
import { printReceipt } from "@/lib/shop/receipt";
import {
  KITCHEN_LATE_MINUTES,
  isLineDone,
  kitchenProgress,
  kitchenStatus,
  waitingMinutes,
  type Order,
  type OrderLine,
} from "@/lib/shop/types";

import { EMPTY_FORM_STATE } from "../form-state";
import { Alert } from "../form-ui";
import DeleteOrderForm from "../order-delete-form";
import { setItemDone, setTicketDone } from "./actions";

function ReprintButton({
  order,
  className = "",
}: {
  order: Order;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => printReceipt(order)}
      className={`text-[0.7rem] text-muted/60 transition-colors hover:text-foreground ${className}`}
    >
      Reprint bill
    </button>
  );
}

/** How often the board pulls fresh tickets, and re-reads the clock. */
const REFRESH_MS = 15_000;

type Toggle = (formData: FormData) => void;

// --- The clock --------------------------------------------------------------
//
// Waiting times are a duration measured against the reader's own clock, which
// makes the clock an external store that changes on its own — which is exactly
// what `useSyncExternalStore` is for. The snapshot is cached in a module
// variable rather than read fresh: a `getSnapshot` that returned a new number
// on every call would never compare equal to itself, and would re-render for
// ever.

let clockSnapshot = 0;

function subscribeToClock(onChange: () => void): () => void {
  clockSnapshot = Date.now();
  onChange();

  const timer = setInterval(() => {
    clockSnapshot = Date.now();
    onChange();
  }, REFRESH_MS);

  return () => clearInterval(timer);
}

function getClock(): number {
  return clockSnapshot;
}

/** The server has no clock worth reporting here, and `0` reads as "not yet". */
function getServerClock(): number {
  return 0;
}

/**
 * One item on a ticket: a checkbox that is really a form.
 *
 * Deliberately a whole-row target. The person tapping this is standing at a
 * hot pass, often in gloves, looking at a screen from arm's length — a 16px
 * checkbox is not a thing they can reliably hit.
 */
function ItemButton({ line, done }: { line: OrderLine; done: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-pressed={done}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors disabled:opacity-40 ${
        done ? "text-muted hover:bg-white/[0.04]" : "hover:bg-white/[0.06]"
      }`}
    >
      <span
        aria-hidden
        className={`flex size-5 shrink-0 items-center justify-center rounded-md border text-[0.7rem] font-bold transition-colors ${
          done
            ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
            : "border-white/20"
        }`}
      >
        {pending ? "…" : done ? "✓" : ""}
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums">
        {line.quantity}×
      </span>
      <span
        className={`min-w-0 flex-1 text-sm leading-snug break-words ${
          done ? "line-through" : ""
        }`}
      >
        {line.name}
      </span>
    </button>
  );
}

function ItemForm({
  order,
  line,
  toggle,
}: {
  order: Order;
  line: OrderLine;
  toggle: Toggle;
}) {
  const done = isLineDone(order, line.itemId);

  return (
    <li>
      <form action={toggle}>
        <input type="hidden" name="orderId" value={order.id} />
        <input type="hidden" name="itemId" value={line.itemId} />
        {/* The state being asked for, not "the opposite of what I can see". */}
        <input type="hidden" name="done" value={done ? "0" : "1"} />
        <ItemButton line={line} done={done} />
      </form>
    </li>
  );
}

function TicketButton({
  children,
  emphasis,
}: {
  children: React.ReactNode;
  emphasis: "primary" | "quiet";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`w-full rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40 ${
        emphasis === "primary"
          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
          : "border-white/10 text-muted hover:border-white/20 hover:text-foreground"
      }`}
    >
      {pending ? "…" : children}
    </button>
  );
}

function TicketForm({
  order,
  done,
  toggle,
  emphasis,
  children,
}: {
  order: Order;
  done: boolean;
  toggle: Toggle;
  emphasis: "primary" | "quiet";
  children: React.ReactNode;
}) {
  return (
    <form action={toggle}>
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="done" value={done ? "1" : "0"} />
      <TicketButton emphasis={emphasis}>{children}</TicketButton>
    </form>
  );
}

function WaitChip({ minutes }: { minutes: number }) {
  const late = minutes >= KITCHEN_LATE_MINUTES;

  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold tabular-nums ${
        late
          ? "border-red-500/40 bg-red-500/10 text-red-300"
          : "border-white/10 text-muted"
      }`}
    >
      {minutes}m
    </span>
  );
}

function Ticket({
  order,
  now,
  toggleItem,
  toggleTicket,
}: {
  order: Order;
  /** `null` until the browser's clock takes over, and on a past day's board. */
  now: number | null;
  toggleItem: Toggle;
  toggleTicket: Toggle;
}) {
  const status = kitchenStatus(order);
  const { done, total } = kitchenProgress(order);
  const allMade = done === total;
  const minutes = now === null ? null : waitingMinutes(order, now);
  const late = minutes !== null && minutes >= KITCHEN_LATE_MINUTES;

  return (
    <li
      className={`flex min-w-0 flex-col rounded-2xl border bg-white/[0.03] transition-colors ${
        late
          ? "border-red-500/30"
          : status === "working"
            ? "border-accent/30"
            : "border-white/10"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
        <span className="text-sm font-bold tracking-tight">
          #{order.reference}
        </span>
        <span className="truncate text-[0.7rem] text-muted">
          {formatIstTime(order.placedAtMs)} · {order.method}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {minutes !== null && <WaitChip minutes={minutes} />}
          <span className="shrink-0 text-[0.7rem] text-muted tabular-nums">
            {done}/{total}
          </span>
        </span>
      </div>

      <ul className="flex-1 px-1.5 py-1.5">
        {order.lines.map((line) => (
          <ItemForm
            key={line.itemId}
            order={order}
            line={line}
            toggle={toggleItem}
          />
        ))}
      </ul>

      <div className="px-3 pb-3">
        <TicketForm
          order={order}
          done
          toggle={toggleTicket}
          // Once every item is ticked the only thing left to do is send it, so
          // the button stops being one of two choices and becomes the choice.
          emphasis={allMade ? "primary" : "quiet"}
        >
          {allMade ? "Send ticket ✓" : `Send ticket (${total - done} left)`}
        </TicketForm>
        <div className="mt-2 flex items-center justify-between">
          <ReprintButton order={order} />
          <DeleteOrderForm order={order} />
        </div>
      </div>
    </li>
  );
}

function ServedRow({ order, toggle }: { order: Order; toggle: Toggle }) {
  const completed = order.kitchen.completed;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
      <span className="font-medium text-muted">#{order.reference}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted/70">
        {order.lines.map((line) => `${line.quantity} × ${line.name}`).join(", ")}
      </span>
      {completed && (
        <span className="shrink-0 text-[0.7rem] text-muted/60">
          sent {formatIstTime(completed.atMs)} by{" "}
          {completed.by.name ?? (completed.by.email || "someone")}
        </span>
      )}
      <ReprintButton order={order} className="shrink-0" />
      <DeleteOrderForm order={order} className="shrink-0" />
      <form action={toggle} className="shrink-0">
        <input type="hidden" name="orderId" value={order.id} />
        <input type="hidden" name="done" value="0" />
        <TicketButton emphasis="quiet">Reopen</TicketButton>
      </form>
    </li>
  );
}

function Panel({
  title,
  tone = "quiet",
  children,
}: {
  title: string;
  tone?: "quiet" | "danger";
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-2xl border border-white/10 bg-white/[0.03]">
      <summary
        className={`cursor-pointer list-none px-5 py-3 text-sm font-semibold tracking-wide transition-colors ${
          tone === "danger" ? "text-red-300/80 hover:text-red-300" : "hover:text-accent"
        }`}
      >
        {title}
      </summary>
      <div className="border-t border-white/[0.06]">{children}</div>
    </details>
  );
}

export default function KitchenBoard({
  orders,
  cancelled,
  live,
}: {
  orders: Order[];
  cancelled: Order[];
  /** Today's board polls and counts minutes. A past day is just a record. */
  live: boolean;
}) {
  const router = useRouter();
  // One action state per level rather than per button: a board-wide `Alert` is
  // the only place an error can go where a cook will actually see it, and each
  // button reports its own pending state through `useFormStatus` anyway.
  const [itemState, toggleItem] = useActionState(setItemDone, EMPTY_FORM_STATE);
  const [ticketState, toggleTicket] = useActionState(
    setTicketDone,
    EMPTY_FORM_STATE,
  );

  const [polling, setPolling] = useState(live);

  // `0` before the browser has reported one, which is also what the server
  // render sees — so a ticket's age simply appears once there is a clock to
  // measure it against, and hydration has nothing to disagree about.
  const clock = useSyncExternalStore(subscribeToClock, getClock, getServerClock);
  const now = live && clock > 0 ? clock : null;

  useEffect(() => {
    if (!live || !polling) return;

    // Orders are rung up at the till, on another device entirely, so nothing on
    // this screen would otherwise ever learn about them.
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, polling, router]);

  const open = orders.filter((order) => order.kitchen.completed === null);
  const served = orders
    .filter((order) => order.kitchen.completed !== null)
    .sort(
      (a, b) => (b.kitchen.completed?.atMs ?? 0) - (a.kitchen.completed?.atMs ?? 0),
    );

  return (
    <div className="flex flex-col gap-4">
      {live && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPolling((on) => !on)}
            aria-pressed={polling}
            className="rounded-full border border-white/10 px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-white/20 hover:text-foreground"
          >
            <span className={polling ? "text-emerald-400" : "text-muted/50"}>
              ●
            </span>{" "}
            {polling ? "Live" : "Paused"}
          </button>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="rounded-full border border-white/10 px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-white/20 hover:text-foreground"
          >
            Refresh now
          </button>
          <p className="text-[0.7rem] text-muted/60">
            New orders appear on their own every {REFRESH_MS / 1000} seconds.
          </p>
        </div>
      )}

      <Alert message={itemState.error ?? ticketState.error} />

      {open.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-12 text-center text-sm text-muted">
          {orders.length === 0
            ? "No orders on this day yet."
            : "Everything has been sent. Nothing waiting on the pass."}
        </p>
      ) : (
        <ul className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {open.map((order) => (
            <Ticket
              key={order.id}
              order={order}
              now={now}
              toggleItem={toggleItem}
              toggleTicket={toggleTicket}
            />
          ))}
        </ul>
      )}

      {served.length > 0 && (
        <Panel title={`Sent · ${served.length}`}>
          <ul className="divide-y divide-white/[0.06] px-5">
            {served.map((order) => (
              <ServedRow key={order.id} order={order} toggle={toggleTicket} />
            ))}
          </ul>
        </Panel>
      )}

      {cancelled.length > 0 && (
        <Panel title={`Voided · ${cancelled.length} — do not make`} tone="danger">
          <ul className="divide-y divide-white/[0.06] px-5">
            {cancelled.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center gap-x-3 py-2.5 text-sm"
              >
                <span className="font-medium text-muted line-through">
                  #{order.reference}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted/70">
                  {order.lines
                    .map((line) => `${line.quantity} × ${line.name}`)
                    .join(", ")}
                </span>
                <span className="shrink-0 text-xs text-muted/60 tabular-nums">
                  {formatMoney(order.total)}
                </span>
                <ReprintButton order={order} className="shrink-0" />
                <DeleteOrderForm order={order} className="shrink-0" />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <p className="text-[0.7rem] text-muted/70">
        Tap an item to tick it off as it comes out, and Send ticket when the
        whole order is handed over. A sent ticket counts every item as made, so
        a simple order can go in one tap. Reopen puts one back on the pass
        exactly as it was.
      </p>
    </div>
  );
}
