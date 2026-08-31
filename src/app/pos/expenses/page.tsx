import Link from "next/link";

import { requirePosUser } from "@/lib/auth/session";
import {
  businessDate,
  businessMonth,
  formatBusinessMonth,
  formatDayMonth,
  isBusinessMonth,
  shiftBusinessMonth,
} from "@/lib/shop/dates";
import { getMonthlyExpenses } from "@/lib/shop/expenses";
import { getMaterialSpendForMonth } from "@/lib/shop/materials";
import { formatMoney } from "@/lib/shop/money";
import { EXPENSE_METHODS, type ExpenseSummary } from "@/lib/shop/types";

import ExpenseList from "./expense-list";

import PosHeader from "../header";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requirePosUser();

  const { month: requested } = await searchParams;
  // An unparseable ?month= falls back to this month rather than erroring, the
  // same way the daily report treats a bad ?date=.
  const month = isBusinessMonth(requested) ? requested : businessMonth();
  const thisMonth = businessMonth();

  const [{ summary, expenses }, materialSpend] = await Promise.all([
    getMonthlyExpenses(month),
    getMaterialSpendForMonth(month),
  ]);

  const today = businessDate();

  return (
    <div className="flex flex-1 flex-col">
      <PosHeader user={user} current="/pos/expenses" subtitle="Expenses" />

      <div className="flex flex-col gap-6 px-4 pb-8 sm:px-6">
        <MonthNav month={month} thisMonth={thisMonth} />
        <Totals summary={summary} materialSpend={materialSpend} />

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <ExpenseList
            expenses={expenses}
            month={month}
            // Backdating is a keystroke away, but the overwhelmingly common
            // entry is one made on the day the money went out. On an older
            // month there is no such day, so the first of it is the honest
            // default — visibly wrong if unnoticed, rather than quietly wrong.
            defaultDate={month === thisMonth ? today : `${month}-01`}
          />
          <div className="flex min-w-0 flex-col gap-6">
            <Categories summary={summary} />
            <Methods summary={summary} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthNav({ month, thisMonth }: { month: string; thisMonth: string }) {
  const previous = shiftBusinessMonth(month, -1);
  const next = shiftBusinessMonth(month, 1);

  const link =
    "rounded-full border border-white/10 px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-white/20 hover:text-foreground";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-base font-semibold tracking-tight">
        {formatBusinessMonth(month)}
        {month === thisMonth && (
          <span className="ml-2 text-xs font-normal text-accent">
            This month
          </span>
        )}
      </h1>
      <div className="flex flex-wrap gap-2">
        <Link href={`/pos/expenses?month=${previous}`} className={link}>
          ← {formatBusinessMonth(previous)}
        </Link>
        {/* Next month has nothing spent in it yet, so forward stops at this one. */}
        {month < thisMonth && (
          <Link href={`/pos/expenses?month=${next}`} className={link}>
            {formatBusinessMonth(next)} →
          </Link>
        )}
        {month !== thisMonth && (
          <Link href="/pos/expenses" className={link}>
            This month
          </Link>
        )}
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="text-[0.65rem] tracking-wider text-muted/70 uppercase">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[0.65rem] text-muted/60">{hint}</p>}
    </div>
  );
}

/**
 * The month's outgoings.
 *
 * Material purchases are pulled from the inventory ledger rather than retyped
 * here, so the two records stay one record. Only the third tile adds them
 * together — the first two are each complete on their own terms.
 */
function Totals({
  summary,
  materialSpend,
}: {
  summary: ExpenseSummary;
  materialSpend: number;
}) {
  return (
    <section
      aria-label="Month totals"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      <Tile
        label="Expenses"
        value={formatMoney(summary.total)}
        hint={`${summary.count} ${summary.count === 1 ? "entry" : "entries"}`}
      />
      <Tile
        label="Materials bought"
        value={formatMoney(materialSpend)}
        hint="From the inventory ledger"
      />
      <Tile
        label="Total out"
        value={formatMoney(summary.total + materialSpend)}
      />
      <Tile
        label="Biggest category"
        value={summary.byCategory[0]?.category ?? "—"}
        hint={
          summary.byCategory[0]
            ? formatMoney(summary.byCategory[0].total)
            : undefined
        }
      />
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

function Categories({ summary }: { summary: ExpenseSummary }) {
  const largest = summary.byCategory[0]?.total ?? 0;

  return (
    <Panel title="Where it went">
      {summary.byCategory.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">
          Nothing recorded for this month.
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06] px-5">
          {summary.byCategory.map((row) => (
            <li key={row.category} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{row.category}</span>
                <span className="shrink-0 text-xs text-muted tabular-nums">
                  × {row.count}
                </span>
                <span className="w-24 shrink-0 text-right tabular-nums">
                  {formatMoney(row.total)}
                </span>
              </div>
              {/* Scaled against the largest category, not the total: the point
                  is which line dwarfs the others, and against a total every bar
                  on a well-spread month is a stub. */}
              <div
                aria-hidden
                className="mt-1.5 h-1 rounded-full bg-accent/70"
                style={{
                  width: `${largest === 0 ? 0 : Math.max(2, (row.total / largest) * 100)}%`,
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Methods({ summary }: { summary: ExpenseSummary }) {
  const busiest = [...summary.byDate].sort((a, b) => b.total - a.total)[0];

  return (
    <Panel title="How it was paid">
      <ul className="divide-y divide-white/[0.06] px-5">
        {EXPENSE_METHODS.map((method) => (
          <li
            key={method}
            className="flex items-baseline justify-between gap-3 py-2.5 text-sm"
          >
            <span>{method}</span>
            <span className="shrink-0 text-xs text-muted tabular-nums">
              × {summary.byMethod[method].count}
            </span>
            <span className="w-24 shrink-0 text-right tabular-nums">
              {formatMoney(summary.byMethod[method].total)}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-white/10 px-5 py-3 text-[0.7rem] text-muted/70">
        {busiest
          ? `Heaviest day: ${formatDayMonth(busiest.date)} · ${formatMoney(busiest.total)}`
          : "No spend recorded yet this month."}
      </p>
    </Panel>
  );
}
