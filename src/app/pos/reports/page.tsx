import Link from "next/link";

import { requirePosUser } from "@/lib/auth/session";
import {
  businessDate,
  formatBusinessDate,
  formatIstTime,
  isBusinessDate,
  shiftBusinessDate,
} from "@/lib/shop/dates";
import { formatMoney } from "@/lib/shop/money";
import { getDailyReport } from "@/lib/shop/reports";
import { PAYMENT_METHODS, type DailyReport, type Order } from "@/lib/shop/types";

import PosHeader from "../header";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requirePosUser();

  const { date: requested } = await searchParams;
  // An unparseable ?date= falls back to today rather than erroring — this screen
  // is read-only, and a bad link should still show something useful.
  const date = isBusinessDate(requested) ? requested : businessDate();
  const today = businessDate();

  const { report, orders } = await getDailyReport(date);

  return (
    <div className="flex flex-1 flex-col">
      <PosHeader user={user} current="/pos/reports" subtitle="Reports" />

      <div className="flex flex-col gap-6 px-4 pb-8 sm:px-6">
        <DateNav date={date} today={today} />
        <Totals report={report} />

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <TopItems report={report} />
          <Orders orders={orders} />
        </div>
      </div>
    </div>
  );
}

function DateNav({ date, today }: { date: string; today: string }) {
  const previous = shiftBusinessDate(date, -1);
  const next = shiftBusinessDate(date, 1);

  const link =
    "rounded-full border border-white/10 px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-white/20 hover:text-foreground";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-base font-semibold tracking-tight">
        {formatBusinessDate(date)}
        {date === today && (
          <span className="ml-2 text-xs font-normal text-accent">Today</span>
        )}
      </h1>
      <div className="flex gap-2">
        <Link href={`/pos/reports?date=${previous}`} className={link}>
          ← {formatBusinessDate(previous)}
        </Link>
        {/* Tomorrow has no sales yet, so forward navigation stops at today. */}
        {date < today && (
          <Link href={`/pos/reports?date=${next}`} className={link}>
            {formatBusinessDate(next)} →
          </Link>
        )}
        {date !== today && (
          <Link href="/pos/reports" className={link}>
            Today
          </Link>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="text-[0.65rem] tracking-wider text-muted/70 uppercase">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Totals({ report }: { report: DailyReport }) {
  return (
    <section aria-label="Day totals" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Orders" value={String(report.orderCount)} />
        <Tile label="Net sales" value={formatMoney(report.grossSubtotal)} />
        <Tile label="Tax collected" value={formatMoney(report.grossTax)} />
        <Tile label="Gross taken" value={formatMoney(report.grossTotal)} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {PAYMENT_METHODS.map((method) => (
          <Tile
            key={method}
            label={`${method} · ${report.byMethod[method].count}`}
            value={formatMoney(report.byMethod[method].total)}
          />
        ))}
      </div>
    </section>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03]"
    >
      <h2 className="border-b border-white/10 px-5 py-3 text-sm font-semibold tracking-wide">
        {title}
      </h2>
      {children}
    </section>
  );
}

function TopItems({ report }: { report: DailyReport }) {
  return (
    <Panel title="Items sold">
      {report.topItems.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">
          Nothing sold on this day.
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06] px-5">
          {report.topItems.map((item) => (
            <li
              key={item.itemId}
              className="flex items-baseline justify-between gap-3 py-2.5 text-sm"
            >
              <span className="min-w-0 truncate">{item.name}</span>
              <span className="shrink-0 text-muted tabular-nums">
                × {item.quantity}
              </span>
              <span className="w-20 shrink-0 text-right tabular-nums">
                {formatMoney(item.total)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Orders({ orders }: { orders: Order[] }) {
  return (
    <Panel title="Orders">
      {orders.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">
          No orders recorded yet.
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06] px-5">
          {orders.map((order) => (
            <li key={order.id} className="py-3">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">#{order.reference}</span>
                <span className="text-xs text-muted">
                  {formatIstTime(order.placedAtMs)} · {order.method}
                </span>
                <span className="ml-auto font-semibold text-accent tabular-nums">
                  {formatMoney(order.total)}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-muted">
                {order.lines
                  .map((line) => `${line.quantity} × ${line.name}`)
                  .join(", ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
