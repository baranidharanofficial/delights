import "server-only";

import { getOrdersForDate } from "./orders";
import { PAYMENT_METHODS, type DailyReport, type Order } from "./types";

/**
 * Rolls a day's orders up in memory.
 *
 * Firestore aggregation queries could sum the totals server-side, but they
 * cannot produce the per-item breakdown without a second data model to maintain.
 * A single counter's daily orders comfortably fit in one pass.
 */
export function summarise(date: string, orders: Order[]): DailyReport {
  const byMethod = Object.fromEntries(
    PAYMENT_METHODS.map((method) => [method, { count: 0, total: 0 }]),
  ) as DailyReport["byMethod"];

  const items = new Map<string, { name: string; quantity: number; total: number }>();

  let grossSubtotal = 0;
  let grossTax = 0;
  let grossTotal = 0;
  let voidedCount = 0;
  let voidedTotal = 0;

  for (const order of orders) {
    // Voided sales are counted separately, never folded into the takings. They
    // still need reporting — "why is the till short" is answered by this number.
    if (order.voided) {
      voidedCount += 1;
      voidedTotal += order.total;
      continue;
    }

    grossSubtotal += order.subtotal;
    grossTax += order.tax;
    grossTotal += order.total;

    byMethod[order.method].count += 1;
    byMethod[order.method].total += order.total;

    for (const line of order.lines) {
      // Keyed by item id so a later rename does not split one item into two
      // rows; the name shown is whatever the most recent sale recorded.
      const running = items.get(line.itemId) ?? {
        name: line.name,
        quantity: 0,
        total: 0,
      };
      running.name = line.name;
      running.quantity += line.quantity;
      running.total += line.lineTotal;
      items.set(line.itemId, running);
    }
  }

  const topItems = [...items.entries()]
    .map(([itemId, item]) => ({ itemId, ...item }))
    .sort((a, b) => b.quantity - a.quantity || b.total - a.total);

  return {
    businessDate: date,
    orderCount: orders.length - voidedCount,
    grossSubtotal,
    grossTax,
    grossTotal,
    byMethod,
    topItems,
    voidedCount,
    voidedTotal,
  };
}

export async function getDailyReport(
  date: string,
): Promise<{ report: DailyReport; orders: Order[] }> {
  const orders = await getOrdersForDate(date);
  return { report: summarise(date, orders), orders };
}
