/**
 * Business-day arithmetic, pinned to IST.
 *
 * India has never observed daylight saving, so the offset is a constant rather
 * than a timezone lookup. That keeps these functions pure and identical on the
 * server and in the browser — no dependency on whichever ICU dataset the runtime
 * happens to ship.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` for the IST calendar day containing `at`. */
export function businessDate(at: Date = new Date()): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Shifts a `YYYY-MM-DD` business date by whole days. */
export function shiftBusinessDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function isBusinessDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** `10 Aug 2026` — for report headings. */
export function formatBusinessDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** `10 Aug` — for lists that already sit under a month heading. */
export function formatDayMonth(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

/** `14:05` in IST — for order timestamps on the report. */
export function formatIstTime(epochMs: number): string {
  const shifted = new Date(epochMs + IST_OFFSET_MS);
  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** Half-open UTC bounds `[start, end)` of an IST business date. */
export function businessDateBounds(date: string): { start: Date; end: Date } {
  const start = Date.parse(`${date}T00:00:00Z`) - IST_OFFSET_MS;
  return { start: new Date(start), end: new Date(start + DAY_MS) };
}

// --- Months -----------------------------------------------------------------
//
// Expenses are read a month at a time rather than a day at a time: rent and a
// utility bill say nothing useful about a Tuesday, and a month is the period a
// shop actually decides anything on.

/** `YYYY-MM` for the IST calendar month containing `at`. */
export function businessMonth(at: Date = new Date()): string {
  return businessDate(at).slice(0, 7);
}

export function isBusinessMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Shifts a `YYYY-MM` by whole months. */
export function shiftBusinessMonth(month: string, months: number): string {
  const [year, index] = month.split("-").map(Number);
  // Counted in absolute months so December + 1 rolls into the next January
  // rather than landing on a thirteenth month.
  const absolute = year * 12 + (index - 1) + months;
  const shiftedYear = Math.floor(absolute / 12);
  const shiftedMonth = absolute - shiftedYear * 12 + 1;

  return `${String(shiftedYear).padStart(4, "0")}-${String(shiftedMonth).padStart(2, "0")}`;
}

/**
 * Inclusive `YYYY-MM-DD` bounds of a business month.
 *
 * Business dates are stored as strings, and their lexical order is their
 * chronological order, so a range query over these two values needs nothing
 * more than the single-field index Firestore already maintains.
 */
export function businessMonthBounds(month: string): {
  first: string;
  last: string;
} {
  const [year, index] = month.split("-").map(Number);
  // Day 0 of the following month is the last day of this one, which spares us a
  // leap-year table.
  const lastDay = new Date(Date.UTC(year, index, 0)).getUTCDate();

  return { first: `${month}-01`, last: `${month}-${String(lastDay).padStart(2, "0")}` };
}

/** `Aug 2026` — for month headings. */
export function formatBusinessMonth(month: string): string {
  const [year, index] = month.split("-").map(Number);
  return `${MONTHS[index - 1]} ${year}`;
}
