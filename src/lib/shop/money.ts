/**
 * Money helpers. Pure and dependency-free so both the terminal (client) and the
 * order writer (server) can share one definition of what a total is.
 *
 * Every amount in this app is an integer count of paise. Rupees never appear as
 * floats — `19.90 * 3` is not 59.70 in binary floating point, and a POS that
 * disagrees with its own receipt by a paisa is a POS nobody trusts.
 */

/** Flat GST on prepared food. Adjust once the tax treatment is confirmed. */
export const TAX_RATE = 0.05;
export const TAX_LABEL = "GST (5%)";

export function taxOn(subtotal: number): number {
  return Math.round(subtotal * TAX_RATE);
}

/** Indian digit grouping: 12,34,567 — three digits, then pairs. */
function groupRupees(digits: string): string {
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${head},${digits.slice(-3)}`;
}

/**
 * Formats minor units as rupees. Deliberately not `Intl.NumberFormat` — a
 * hand-rolled formatter renders identically on the server and the client
 * regardless of the ICU data each one ships with.
 */
export function formatMoney(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const absolute = Math.abs(Math.round(minor));
  const rupees = groupRupees(String(Math.trunc(absolute / 100)));
  const paise = String(absolute % 100).padStart(2, "0");
  return `${sign}₹${rupees}.${paise}`;
}

/**
 * Parses a rupee string from an admin form into paise.
 *
 * Returns `null` rather than throwing or coercing to `NaN`, so the caller
 * decides what a bad price means. Rejects more than two decimal places instead
 * of rounding: silently turning ₹10.999 into ₹11.00 is the kind of thing you
 * only notice at the end of the month.
 */
export function parseRupees(input: string): number | null {
  const trimmed = input.trim().replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;

  const [rupees, paise = ""] = trimmed.split(".");
  return Number(rupees) * 100 + Number(paise.padEnd(2, "0"));
}

/** Renders paise as a bare decimal for a form input — `19000` → `"190.00"`. */
export function toRupeeInput(minor: number): string {
  return (minor / 100).toFixed(2);
}
