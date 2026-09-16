import { requireSection } from "@/lib/auth/session";
import { businessDate } from "@/lib/shop/dates";
import { getMenu } from "@/lib/shop/menu";
import { getOrdersForDate } from "@/lib/shop/orders";

import PosShell from "./shell";
import PosTerminal from "./terminal";

export default async function PosPage() {
  // Authoritative check — the proxy gate is only an optimisation.
  const user = await requireSection("/pos");
  const [{ categories, items }, recentOrders] = await Promise.all([
    getMenu(),
    getOrdersForDate(businessDate()),
  ]);

  return (
    <PosShell user={user} current="/pos" subtitle="Counter 1">
      <PosTerminal
        categories={categories}
        items={items}
        recentOrders={recentOrders}
      />
    </PosShell>
  );
}
