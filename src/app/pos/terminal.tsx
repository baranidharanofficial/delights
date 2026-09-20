"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";

import {
  formatBusinessDate,
  formatDayMonth,
  shiftBusinessDate,
} from "@/lib/shop/dates";
import { FLAT_DISCOUNT_AMOUNT, FLAT_DISCOUNT_MIN_ORDER } from "@/lib/shop/launch-offer";
import {
  formatMoney,
  MANUAL_DISCOUNT_MAX_PERCENT,
  MANUAL_DISCOUNT_MIN_PERCENT,
  TAX_LABEL,
  taxOn,
} from "@/lib/shop/money";
import { printReceipt } from "@/lib/shop/receipt";
import {
  emptyKitchen,
  PAYMENT_METHODS,
  type Category,
  type MenuItem,
  type Order,
  type PaymentMethod,
} from "@/lib/shop/types";

import { checkout } from "./actions";
import PastOrders from "./past-orders";

/** Sample receipt used to test paper alignment and printer setup. */
function testOrder(): Order {
  const now = Date.now();
  const subtotal = 258;
  const tax = taxOn(subtotal);
  return {
    id: "test-print",
    reference: "TEST",
    businessDate: new Date(now).toISOString().slice(0, 10),
    placedAtMs: now,
    lines: [
      { itemId: "test-1", name: "Sample Item A", unitPrice: 120, quantity: 1, lineTotal: 120 },
      { itemId: "test-2", name: "Sample Item B", unitPrice: 69, quantity: 2, lineTotal: 138 },
    ],
    subtotal,
    tax,
    taxRate: tax / subtotal,
    taxLabel: TAX_LABEL,
    taxExempt: false,
    discount: null,
    manualDiscount: null,
    total: subtotal + tax,
    method: "Cash",
    cashier: { email: "", name: "Test Print" },
    voided: null,
    kitchen: emptyKitchen(),
  };
}

type CartLine = { item: MenuItem; quantity: number };

/** Insertion-ordered map of item id → quantity. */
type Quantities = Record<string, number>;

/** Units at which the terminal starts warning the cashier. */
const LOW_STOCK = 5;

function sellableLimit(item: MenuItem): number {
  if (!item.available) return 0;
  return item.stock ?? Number.POSITIVE_INFINITY;
}

const DATE_NAV_LINK =
  "rounded-full border border-white/10 px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-white/20 hover:text-foreground";

/**
 * Switches which business date the terminal rings sales up against — a link,
 * not a client filter, so the menu's stock and the "past orders" panel both
 * reload for the day actually being sold against.
 */
function DateSwitcher({ date, today }: { date: string; today: string }) {
  const backdating = date !== today;

  return (
    <div
      className="flex items-center gap-1.5"
      role="group"
      aria-label="Business date"
    >
      <Link
        href={`/pos?date=${shiftBusinessDate(date, -1)}`}
        aria-label="Previous day"
        className={DATE_NAV_LINK}
      >
        ‹
      </Link>
      <span
        className={`min-w-[5.5rem] text-center text-xs font-medium ${
          backdating ? "text-amber-400" : "text-muted"
        }`}
      >
        {backdating ? formatBusinessDate(date) : "Today"}
      </span>
      {backdating && (
        <Link
          href={`/pos?date=${shiftBusinessDate(date, 1)}`}
          aria-label="Next day"
          className={DATE_NAV_LINK}
        >
          ›
        </Link>
      )}
      {backdating && (
        <Link href="/pos" className={DATE_NAV_LINK}>
          Today
        </Link>
      )}
    </div>
  );
}

export default function PosTerminal({
  categories,
  items,
  recentOrders,
  date,
  today,
}: {
  categories: Category[];
  items: MenuItem[];
  recentOrders: Order[];
  /** Business date this screen is ringing sales up against. */
  date: string;
  today: string;
}) {
  const backdating = date !== today;
  const [quantities, setQuantities] = useState<Quantities>({});
  const [categoryId, setCategoryId] = useState<string | "all">("all");
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [couponPhone, setCouponPhone] = useState("");
  const [taxExempt, setTaxExempt] = useState(false);
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(MANUAL_DISCOUNT_MIN_PERCENT);
  const [completed, setCompleted] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPastOrders, setShowPastOrders] = useState(false);
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
  const tax = taxExempt ? 0 : taxOn(subtotal);
  // A courtesy preview, not enforcement — the server is the one that actually
  // knows whether this number has an unspent coupon, same as stock limits
  // above. If the number turns out invalid or already used, checkout fails and
  // nothing here was ever charged.
  const couponDiscount =
    couponPhone.trim() !== "" && subtotal >= FLAT_DISCOUNT_MIN_ORDER
      ? FLAT_DISCOUNT_AMOUNT
      : 0;
  const afterCoupon = Math.max(0, subtotal + tax - couponDiscount);
  const manualDiscountAmount = discountEnabled
    ? Math.round((afterCoupon * discountPercent) / 100)
    : 0;
  const total = Math.max(0, afterCoupon - manualDiscountAmount);
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
    setCouponPhone("");
    setTaxExempt(false);
    setDiscountEnabled(false);
    setDiscountPercent(MANUAL_DISCOUNT_MIN_PERCENT);
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
      const result = await checkout(request, method, date, {
        couponPhone: couponPhone.trim() || undefined,
        taxExempt: taxExempt || undefined,
        discountPercent: discountEnabled ? discountPercent : undefined,
      });
      if (result.ok) {
        setCompleted(result.order);
        setQuantities({});
        setCouponPhone("");
        setTaxExempt(false);
        setDiscountEnabled(false);
        setDiscountPercent(MANUAL_DISCOUNT_MIN_PERCENT);
        setError(null);
        printReceipt(result.order);
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

          <DateSwitcher date={date} today={today} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
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
          <button
            type="button"
            onClick={() => setShowPastOrders(true)}
            className="rounded-full border border-white/10 px-3.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-white/20 hover:text-foreground"
          >
            {backdating ? `Orders · ${formatDayMonth(date)}` : "Today’s orders"}
          </button>
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
          <Receipt
            order={completed}
            today={today}
            onDismiss={() => setCompleted(null)}
          />
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
            {backdating && (
              <p className="border-b border-amber-500/20 bg-amber-500/10 px-5 py-2 text-[0.7rem] text-amber-300">
                This order will be recorded against {formatBusinessDate(date)}
                , not today.
              </p>
            )}

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
              <label className="block text-xs text-muted">
                Launch coupon (optional)
                <input
                  type="tel"
                  inputMode="numeric"
                  value={couponPhone}
                  onChange={(event) => setCouponPhone(event.target.value)}
                  placeholder="98765 43210"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-foreground placeholder:text-muted/60 focus:border-accent/40 focus:outline-none"
                />
              </label>

              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={taxExempt}
                  onChange={(event) => setTaxExempt(event.target.checked)}
                  className="size-3.5 rounded-sm border-white/20 bg-white/[0.04] accent-accent"
                />
                No tax on this order
              </label>

              <div>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={discountEnabled}
                    onChange={(event) => setDiscountEnabled(event.target.checked)}
                    className="size-3.5 rounded-sm border-white/20 bg-white/[0.04] accent-accent"
                  />
                  Apply a discount
                </label>

                {discountEnabled && (
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="range"
                      min={MANUAL_DISCOUNT_MIN_PERCENT}
                      max={MANUAL_DISCOUNT_MAX_PERCENT}
                      value={discountPercent}
                      onChange={(event) => setDiscountPercent(Number(event.target.value))}
                      aria-label="Discount percentage"
                      className="h-1.5 flex-1 accent-accent"
                    />
                    <span className="w-10 shrink-0 text-right text-sm font-medium tabular-nums text-accent">
                      {discountPercent}%
                    </span>
                  </div>
                )}
              </div>

              <dl className="space-y-1.5 text-sm">
                <Row label="Subtotal" value={formatMoney(subtotal)} />
                <Row
                  label={TAX_LABEL}
                  value={taxExempt ? "Waived" : formatMoney(tax)}
                />
                {couponDiscount > 0 && (
                  <Row
                    label="Launch coupon"
                    value={`− ${formatMoney(couponDiscount)}`}
                  />
                )}
                {manualDiscountAmount > 0 && (
                  <Row
                    label={`Discount (${discountPercent}%)`}
                    value={`− ${formatMoney(manualDiscountAmount)}`}
                  />
                )}
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

              <div className="text-right">
                <button
                  type="button"
                  onClick={() => printReceipt(testOrder())}
                  className="text-xs text-muted underline-offset-2 transition-colors hover:text-foreground hover:underline"
                >
                  Test print
                </button>
              </div>

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

      {showPastOrders && (
        <PastOrders
          orders={recentOrders}
          title={backdating ? `Orders · ${formatBusinessDate(date)}` : "Today’s orders"}
          onClose={() => setShowPastOrders(false)}
        />
      )}
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
  today,
  onDismiss,
}: {
  order: Order;
  today: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    // Remove the focus from any button so the keyboard shortcut doesn't retrigger
    (document.activeElement as HTMLElement | null)?.blur();
  }, []);

  return (
    <div className="flex flex-col">
      <header className="border-b border-white/10 px-5 py-4">
        <p className="text-xs tracking-[0.2em] text-accent uppercase">
          Payment taken
        </p>
        <h2 className="mt-1.5 text-sm font-semibold">
          Order #{order.reference} · {order.method}
        </h2>
        {order.businessDate !== today && (
          <p className="mt-0.5 text-xs font-medium text-amber-400">
            Recorded against {formatBusinessDate(order.businessDate)}
          </p>
        )}
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
          <Row
            label={order.taxLabel}
            value={order.taxExempt ? "Waived" : formatMoney(order.tax)}
          />
          {order.discount && (
            <Row
              label="Launch coupon"
              value={`− ${formatMoney(order.discount.amount)}`}
            />
          )}
          {order.manualDiscount && (
            <Row
              label={`Discount (${order.manualDiscount.percent}%)`}
              value={`− ${formatMoney(order.manualDiscount.amount)}`}
            />
          )}
          <div className="flex items-baseline justify-between pt-1.5 text-base font-semibold">
            <dt>Paid</dt>
            <dd className="tabular-nums text-accent">
              {formatMoney(order.total)}
            </dd>
          </div>
        </dl>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => printReceipt(order)}
            className="rounded-full border border-white/10 px-4 py-2.5 text-sm text-muted transition-colors hover:border-white/20 hover:text-foreground"
          >
            Print
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-background transition-all hover:brightness-110 active:scale-[0.98]"
          >
            New order
          </button>
        </div>
      </footer>
    </div>
  );
}
