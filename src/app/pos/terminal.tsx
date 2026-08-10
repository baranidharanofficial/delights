"use client";

import { useMemo, useState, useTransition } from "react";

import { formatMoney, TAX_LABEL, taxOn } from "@/lib/shop/money";
import {
  PAYMENT_METHODS,
  type Category,
  type MenuItem,
  type Order,
  type PaymentMethod,
} from "@/lib/shop/types";

import { checkout } from "./actions";

type CartLine = { item: MenuItem; quantity: number };

/** Insertion-ordered map of item id → quantity. */
type Quantities = Record<string, number>;

/** Units at which the terminal starts warning the cashier. */
const LOW_STOCK = 5;

function sellableLimit(item: MenuItem): number {
  if (!item.available) return 0;
  return item.stock ?? Number.POSITIVE_INFINITY;
}

export default function PosTerminal({
  categories,
  items,
}: {
  categories: Category[];
  items: MenuItem[];
}) {
  const [quantities, setQuantities] = useState<Quantities>({});
  const [categoryId, setCategoryId] = useState<string | "all">("all");
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [completed, setCompleted] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCharging, startCharging] = useTransition();

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        (categoryId === "all" || item.categoryId === categoryId) &&
        (needle === "" || item.name.toLowerCase().includes(needle)),
    );
  }, [categoryId, items, query]);

  const lines = useMemo<CartLine[]>(
    () =>
      Object.entries(quantities).flatMap(([id, quantity]) => {
        const item = itemsById.get(id);
        return item && quantity > 0 ? [{ item, quantity }] : [];
      }),
    [itemsById, quantities],
  );

  const subtotal = lines.reduce(
    (sum, line) => sum + line.item.price * line.quantity,
    0,
  );
  const tax = taxOn(subtotal);
  const total = subtotal + tax;
  const itemCount = lines.reduce((count, line) => count + line.quantity, 0);

  function adjust(id: string, delta: number) {
    const item = itemsById.get(id);
    if (!item) return;

    setCompleted(null);
    setError(null);
    setQuantities((current) => {
      const next = { ...current };
      // Clamped here as a courtesy, not as enforcement — the server rechecks
      // stock inside the transaction that writes the order.
      const quantity = Math.min(
        (next[id] ?? 0) + delta,
        sellableLimit(item),
      );
      // Dropping the key rather than storing 0 keeps re-added items at the
      // bottom of the ticket, where the cashier just tapped.
      if (quantity <= 0) delete next[id];
      else next[id] = quantity;
      return next;
    });
  }

  function clearOrder() {
    setQuantities({});
    setCompleted(null);
    setError(null);
  }

  function charge() {
    if (lines.length === 0 || isCharging) return;

    const request = lines.map(({ item, quantity }) => ({
      itemId: item.id,
      quantity,
    }));

    startCharging(async () => {
      const result = await checkout(request, method);
      if (result.ok) {
        setCompleted(result.order);
        setQuantities({});
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="grid flex-1 items-start gap-6 px-4 pb-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section aria-label="Menu" className="min-w-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative w-full sm:max-w-xs">
            <span className="sr-only">Search the menu</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search items…"
              className="w-full rounded-full border border-white/10 bg-white/[0.04] py-2.5 pr-4 pl-4 text-sm placeholder:text-muted/60 focus:border-accent/40 focus:outline-none"
            />
          </label>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
            {[{ id: "all", name: "All" }, ...categories].map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={categoryId === option.id}
                onClick={() => setCategoryId(option.id)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  categoryId === option.id
                    ? "border-accent/40 bg-accent/15 text-accent"
                    : "border-white/10 text-muted hover:border-white/20 hover:text-foreground"
                }`}
              >
                {option.name}
              </button>
            ))}
          </div>
        </div>

        {items.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted">
            The menu is empty. Add items on the{" "}
            <a className="text-accent underline" href="/pos/menu">
              menu screen
            </a>
            .
          </p>
        ) : visibleItems.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted">
            No items match “{query.trim()}”.
          </p>
        ) : (
          <ul className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {visibleItems.map((item) => {
              const quantity = quantities[item.id] ?? 0;
              const limit = sellableLimit(item);
              const soldOut = limit <= 0;
              const atLimit = quantity >= limit;

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => adjust(item.id, 1)}
                    disabled={soldOut || atLimit}
                    className="group relative flex h-full w-full flex-col justify-between gap-3 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition-all hover:border-accent/40 hover:bg-white/[0.06] focus:border-accent/40 focus:outline-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
                  >
                    {item.imageKey && (
                      // Plain <img>: /api/images needs the session cookie, which
                      // the next/image optimizer would not send.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/images/${item.imageKey}`}
                        alt=""
                        loading="lazy"
                        className="-mx-4 -mt-4 h-24 w-[calc(100%+2rem)] object-cover"
                      />
                    )}
                    <span className="text-sm leading-5 font-medium">
                      {item.name}
                    </span>
                    <span className="flex items-center justify-between">
                      <span className="text-sm text-accent">
                        {formatMoney(item.price)}
                      </span>
                      {soldOut ? (
                        <span className="text-[0.65rem] tracking-wider text-muted/70 uppercase">
                          {item.available ? "Sold out" : "Off menu"}
                        </span>
                      ) : item.stock !== null && item.stock <= LOW_STOCK ? (
                        <span className="text-[0.65rem] tracking-wider text-amber-400/80 uppercase">
                          {item.stock} left
                        </span>
                      ) : null}
                    </span>
                    {quantity > 0 && (
                      <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-background">
                        {quantity}
                        <span className="sr-only"> in current order</span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside
        aria-label="Current order"
        className="sticky top-4 flex max-h-[calc(100vh-2rem)] flex-col rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm"
      >
        {completed ? (
          <Receipt order={completed} onDismiss={() => setCompleted(null)} />
        ) : (
          <>
            <header className="flex items-baseline justify-between border-b border-white/10 px-5 py-4">
              <h2 className="text-sm font-semibold tracking-wide">Order</h2>
              <span className="text-xs text-muted">
                {itemCount === 0
                  ? "Empty"
                  : `${itemCount} item${itemCount === 1 ? "" : "s"}`}
              </span>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5">
              {lines.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted">
                  Tap an item to start an order.
                </p>
              ) : (
                <ul className="divide-y divide-white/[0.06]">
                  {lines.map(({ item, quantity }) => (
                    <li key={item.id} className="flex items-start gap-3 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {item.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {quantity} × {formatMoney(item.price)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <StepperButton
                          label={`Remove one ${item.name}`}
                          onClick={() => adjust(item.id, -1)}
                        >
                          −
                        </StepperButton>
                        <span className="w-5 text-center text-sm tabular-nums">
                          {quantity}
                        </span>
                        <StepperButton
                          label={`Add one ${item.name}`}
                          onClick={() => adjust(item.id, 1)}
                          disabled={quantity >= sellableLimit(item)}
                        >
                          +
                        </StepperButton>
                      </div>
                      <span className="w-16 shrink-0 text-right text-sm tabular-nums">
                        {formatMoney(item.price * quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <footer className="space-y-4 border-t border-white/10 px-5 py-4">
              <dl className="space-y-1.5 text-sm">
                <Row label="Subtotal" value={formatMoney(subtotal)} />
                <Row label={TAX_LABEL} value={formatMoney(tax)} />
                <div className="flex items-baseline justify-between pt-1.5 text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums text-accent">
                    {formatMoney(total)}
                  </dd>
                </div>
              </dl>

              <div
                className="grid grid-cols-3 gap-2"
                role="group"
                aria-label="Payment method"
              >
                {PAYMENT_METHODS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={method === name}
                    onClick={() => setMethod(name)}
                    className={`rounded-lg border py-2 text-xs font-medium transition-colors ${
                      method === name
                        ? "border-accent/40 bg-accent/15 text-accent"
                        : "border-white/10 text-muted hover:border-white/20 hover:text-foreground"
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
                >
                  {error}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={clearOrder}
                  disabled={lines.length === 0 || isCharging}
                  className="rounded-full border border-white/10 px-4 py-2.5 text-sm text-muted transition-colors hover:border-white/20 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={charge}
                  disabled={lines.length === 0 || isCharging}
                  className="flex-1 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-background transition-all hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
                >
                  {isCharging ? "Saving…" : `Charge ${formatMoney(total)}`}
                </button>
              </div>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-muted">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function StepperButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-6 items-center justify-center rounded-md border border-white/10 text-sm leading-none text-muted transition-colors hover:border-accent/40 hover:text-accent disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function Receipt({
  order,
  onDismiss,
}: {
  order: Order;
  onDismiss: () => void;
}) {
  return (
    <div className="flex flex-col">
      <header className="border-b border-white/10 px-5 py-4">
        <p className="text-xs tracking-[0.2em] text-accent uppercase">
          Payment taken
        </p>
        <h2 className="mt-1.5 text-sm font-semibold">
          Order #{order.reference} · {order.method}
        </h2>
      </header>

      <div className="max-h-64 overflow-y-auto px-5 py-3">
        <ul className="space-y-2 text-sm">
          {order.lines.map((line) => (
            <li key={line.itemId} className="flex justify-between gap-3">
              <span className="min-w-0 truncate text-muted">
                {line.quantity} × {line.name}
              </span>
              <span className="tabular-nums">{formatMoney(line.lineTotal)}</span>
            </li>
          ))}
        </ul>
      </div>

      <footer className="space-y-4 border-t border-white/10 px-5 py-4">
        <dl className="space-y-1.5 text-sm">
          <Row label="Subtotal" value={formatMoney(order.subtotal)} />
          <Row label={order.taxLabel} value={formatMoney(order.tax)} />
          <div className="flex items-baseline justify-between pt-1.5 text-base font-semibold">
            <dt>Paid</dt>
            <dd className="tabular-nums text-accent">
              {formatMoney(order.total)}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={onDismiss}
          className="w-full rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-background transition-all hover:brightness-110 active:scale-[0.98]"
        >
          New order
        </button>
      </footer>
    </div>
  );
}
