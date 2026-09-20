import "server-only";

import {
  businessDate,
  businessMonth,
  businessMonthBounds,
  formatBusinessMonth,
  formatDayMonth,
  shiftBusinessDate,
  shiftBusinessMonth,
} from "./dates";
import { getFirstOrderDate, getOrdersBetween, getOrdersForDate } from "./orders";
import type { SalesPoint, SalesRange, SalesSeries } from "./sales-range";
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

// --- Sales-over-time chart ---------------------------------------------------

const DAILY_RANGE_DAYS: Record<"7d" | "28d" | "90d", number> = {
  "7d": 7,
  "28d": 28,
  "90d": 90,
};

/** Live sales and order count, voided sales excluded — same rule `summarise` uses. */
function tally(orders: Order[]): { total: number; count: number } {
  let total = 0;
  let count = 0;
  for (const order of orders) {
    if (order.voided) continue;
    total += order.total;
    count += 1;
  }
  return { total, count };
}

/**
 * The sales chart's data, bucketed by day for the short ranges and by month for
 * the long ones.
 *
 * Daily buckets past a few months would put hundreds of points on one line for
 * no reader benefit — a shop decides on "6 months" the way it decides on a
 * month, not a Tuesday — so 6 months, 1 year and lifetime roll up to a point
 * per calendar month instead. "Lifetime" has no fixed start, so it looks up the
 * shop's first order rather than assuming one.
 */
export async function getSalesSeries(range: SalesRange): Promise<SalesSeries> {
  const today = businessDate();

  if (range === "7d" || range === "28d" || range === "90d") {
    const days = DAILY_RANGE_DAYS[range];
    const start = shiftBusinessDate(today, -(days - 1));

    const byDate = new Map<string, Order[]>();
    for (let i = 0; i < days; i++) {
      byDate.set(shiftBusinessDate(start, i), []);
    }

    for (const order of await getOrdersBetween(start, today)) {
      byDate.get(order.businessDate)?.push(order);
    }

    const points: SalesPoint[] = [...byDate.entries()].map(([date, orders]) => {
      const { total, count } = tally(orders);
      return { date, label: formatDayMonth(date), total, orderCount: count };
    });

    return {
      range,
      granularity: "day",
      points,
      totalSales: points.reduce((sum, point) => sum + point.total, 0),
      totalOrders: points.reduce((sum, point) => sum + point.orderCount, 0),
    };
  }

  const endMonth = businessMonth();
  const startMonth =
    range === "6m"
      ? shiftBusinessMonth(endMonth, -5)
      : range === "1y"
        ? shiftBusinessMonth(endMonth, -11)
        : ((await getFirstOrderDate())?.slice(0, 7) ?? endMonth);

  const months: string[] = [];
  for (let month = startMonth; month <= endMonth; month = shiftBusinessMonth(month, 1)) {
    months.push(month);
  }

  const byMonth = new Map<string, Order[]>(months.map((month) => [month, []]));
  const { first: start } = businessMonthBounds(startMonth);
  const { last: end } = businessMonthBounds(endMonth);

  for (const order of await getOrdersBetween(start, end)) {
    byMonth.get(order.businessDate.slice(0, 7))?.push(order);
  }

  const points: SalesPoint[] = months.map((month) => {
    const { total, count } = tally(byMonth.get(month) ?? []);
    return { date: month, label: formatBusinessMonth(month), total, orderCount: count };
  });

  return {
    range,
    granularity: "month",
    points,
    totalSales: points.reduce((sum, point) => sum + point.total, 0),
    totalOrders: points.reduce((sum, point) => sum + point.orderCount, 0),
  };
}
