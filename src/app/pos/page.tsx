import { requireSection } from "@/lib/auth/session";
import { businessDate, isBusinessDate } from "@/lib/shop/dates";
import { getMenu } from "@/lib/shop/menu";
import { getOrdersForDate } from "@/lib/shop/orders";

import PosShell from "./shell";
import PosTerminal from "./terminal";

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  // Authoritative check — the proxy gate is only an optimisation.
  const user = await requireSection("/pos");

  const { date: requested } = await searchParams;
  const today = businessDate();
  // A bad or future ?date= falls back to today rather than erroring or letting
  // the cashier stage a sale against a day that has not happened yet.
  const date = isBusinessDate(requested) && requested <= today ? requested : today;

  const [{ categories, items }, recentOrders] = await Promise.all([
    getMenu(),
    getOrdersForDate(date),
  ]);

  return (
    <PosShell user={user} current="/pos" subtitle="Counter 1">
      <PosTerminal
        categories={categories}
        items={items}
        recentOrders={recentOrders}
        date={date}
        today={today}
      />
    </PosShell>
  );
}
