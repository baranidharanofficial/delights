/**
 * Units of measure for raw materials.
 *
 * Every quantity is stored as a whole number of *base* units — grams,
 * millilitres, or pieces. Storing 2.5 kg as 2500 keeps stock arithmetic exact
 * for the same reason prices are held in paise: repeated fractional
 * addition and subtraction drifts, and a store that disagrees with its own
 * shelf by a gram per transaction is worse than useless by month end.
 *
 * Pure and dependency-free — the inventory forms and the production
 * transaction share one definition of what a quantity means.
 */

export const UNITS = ["g", "ml", "unit"] as const;
export type Unit = (typeof UNITS)[number];

export function isUnit(value: unknown): value is Unit {
  return UNITS.includes(value as Unit);
}

export const UNIT_LABELS: Record<Unit, string> = {
  g: "Weight (g / kg)",
  ml: "Volume (ml / l)",
  unit: "Count (pieces)",
};

/**
 * The units a person may type in, per base unit. The first entry is the base
 * itself; `factor` converts an entered amount into base units.
 */
export const ENTRY_UNITS: Record<Unit, { label: string; factor: number }[]> = {
  g: [
    { label: "g", factor: 1 },
    { label: "kg", factor: 1000 },
  ],
  ml: [
    { label: "ml", factor: 1 },
    { label: "l", factor: 1000 },
  ],
  unit: [{ label: "pcs", factor: 1 }],
};

export function entryFactor(unit: Unit, label: string): number | null {
  return ENTRY_UNITS[unit].find((entry) => entry.label === label)?.factor ?? null;
}

/**
 * Parses a typed amount into whole base units.
 *
 * Returns `null` for anything unparseable, negative, or that would land between
 * two base units (0.5 g, half an egg) rather than rounding silently.
 */
export function parseQuantity(
  input: string,
  unit: Unit,
  entryLabel: string,
): number | null {
  const factor = entryFactor(unit, entryLabel);
  if (factor === null) return null;

  const trimmed = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;

  const base = Number(trimmed) * factor;
  // Floating point makes 2.3 * 1000 land on 2299.9999999999995, so round to the
  // nearest base unit first and only then insist the input was whole.
  const rounded = Math.round(base);
  if (Math.abs(base - rounded) > 1e-6) return null;

  return rounded;
}

/** `2500` g → `"2.5 kg"`, `450` g → `"450 g"`, `12` unit → `"12 pcs"`. */
export function formatQuantity(base: number, unit: Unit): string {
  if (unit === "unit") return `${base} pcs`;

  const large = unit === "g" ? "kg" : "l";
  if (Math.abs(base) >= 1000) {
    // Trim trailing zeros: 2.500 reads as 2.5, 3.000 as 3.
    const value = (base / 1000).toFixed(3).replace(/\.?0+$/, "");
    return `${value} ${large}`;
  }
  return `${base} ${unit}`;
}

/** The unit a cost is quoted against — per kg, per litre, per piece. */
export function costUnitLabel(unit: Unit): string {
  return unit === "g" ? "kg" : unit === "ml" ? "l" : "pc";
}

/** How many base units one costing unit spans. */
export function costUnitSize(unit: Unit): number {
  return unit === "unit" ? 1 : 1000;
}

/**
 * Paise per costing unit (per kg / per litre / per piece), derived from what
 * the stock on hand is currently valued at. `null` when there is no stock to
 * divide by — an empty bin has no meaningful unit price.
 */
export function unitCost(
  stockValue: number,
  stock: number,
  unit: Unit,
): number | null {
  if (stock <= 0) return null;
  return Math.round((stockValue / stock) * costUnitSize(unit));
}

/**
 * Paise that `quantity` base units are worth at the current moving average.
 *
 * Rounded to whole paise at the point of use, which is the only place a
 * fractional rate is allowed to become a money amount.
 */
export function valueOf(
  quantity: number,
  stockValue: number,
  stock: number,
): number {
  if (stock <= 0) return 0;
  return Math.round((stockValue * quantity) / stock);
}
