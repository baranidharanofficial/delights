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

/** `10 Aug 2026` — for report headings. */
export function formatBusinessDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  return `${day} ${months[month - 1]} ${year}`;
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
