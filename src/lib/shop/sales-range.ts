/**
 * The sales chart's range presets and data shapes.
 *
 * Kept out of `reports.ts` for the same reason `launch-offer.ts` is kept free of
 * `firebase-admin`: that module is `server-only`, and the chart is a client
 * component that needs these to label its range tabs. One module, two bundles.
 */

export const SALES_RANGES = [
  { id: "7d", label: "7 days" },
  { id: "28d", label: "28 days" },
  { id: "90d", label: "90 days" },
  { id: "6m", label: "6 months" },
  { id: "1y", label: "1 year" },
  { id: "lifetime", label: "Lifetime" },
] as const;

export type SalesRange = (typeof SALES_RANGES)[number]["id"];

export function isSalesRange(value: unknown): value is SalesRange {
  return SALES_RANGES.some((range) => range.id === value);
}

/** One bucket on the chart — a day for the short ranges, a month for the long ones. */
export type SalesPoint = {
  /** `YYYY-MM-DD` or `YYYY-MM`, whichever this bucket is keyed by. */
  date: string;
  /** `10 Aug` or `Aug 2026` — however the axis should read it. */
  label: string;
  /** Live sales only, same as `DailyReport` — a voided order contributes nothing. */
  total: number;
  orderCount: number;
};

export type SalesSeries = {
  range: SalesRange;
  granularity: "day" | "month";
  points: SalesPoint[];
  totalSales: number;
  totalOrders: number;
};
