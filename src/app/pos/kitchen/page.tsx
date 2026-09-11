import Link from "next/link";

import { requirePosUser } from "@/lib/auth/session";
import {
  businessDate,
  formatBusinessDate,
  isBusinessDate,
  shiftBusinessDate,
} from "@/lib/shop/dates";
import { getOrdersForDate } from "@/lib/shop/orders";
import { isVoided, type Order } from "@/lib/shop/types";

import KitchenBoard from "./board";

import PosShell from "../shell";

/** Oldest first — the kitchen works the pass in the order things were rung up. */
function byOldest(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => a.placedAtMs - b.placedAtMs);
}

export default async function KitchenPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requirePosUser();

  const { date: requested } = await searchParams;
  // A bad ?date= falls back to today rather than erroring. The pass is the
  // worst possible place to meet an error page.
  const date = isBusinessDate(requested) ? requested : businessDate();
  const today = businessDate();

  const orders = await getOrdersForDate(date);
  const live = byOldest(orders.filter((order) => !isVoided(order)));
  const cancelled = byOldest(orders.filter(isVoided));

  const cooking = live.filter((order) => order.kitchen.completed === null).length;

  return (
    <PosShell
      user={user}
      current="/pos/kitchen"
      subtitle={
        cooking > 0 ? `Kitchen · ${cooking} to make` : "Kitchen · all caught up"
      }
    >
      <div className="flex flex-col gap-5 px-4 pb-8 sm:px-6">
        <DateNav date={date} today={today} />
        <KitchenBoard
          orders={live}
          cancelled={cancelled}
          live={date === today}
        />
      </div>
    </PosShell>
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
        <Link href={`/pos/kitchen?date=${previous}`} className={link}>
          ← {formatBusinessDate(previous)}
        </Link>
        {/* Nothing has been ordered tomorrow, so forward stops at today. */}
        {date < today && (
          <Link href={`/pos/kitchen?date=${next}`} className={link}>
            {formatBusinessDate(next)} →
          </Link>
        )}
        {date !== today && (
          <Link href="/pos/kitchen" className={link}>
            Today
          </Link>
        )}
      </div>
    </div>
  );
}
