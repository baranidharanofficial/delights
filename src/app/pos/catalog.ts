/**
 * Placeholder catalog for the POS terminal.
 *
 * Swap this module for real product data (API/DB) when the menu is finalised —
 * the terminal only depends on the shapes exported here.
 */

export const CATEGORIES = ["Cakes", "Pastries", "Cookies", "Beverages"] as const;

export type Category = (typeof CATEGORIES)[number];

export type CatalogItem = {
  id: string;
  name: string;
  /** Minor units (paise). Money stays integral — never float. */
  price: number;
  category: Category;
};

export const CATALOG: readonly CatalogItem[] = [
  { id: "cake-truffle", name: "Belgian Truffle Slice", price: 19000, category: "Cakes" },
  { id: "cake-red-velvet", name: "Red Velvet Slice", price: 21000, category: "Cakes" },
  { id: "cake-cheesecake", name: "Blueberry Cheesecake", price: 24000, category: "Cakes" },
  { id: "cake-coconut", name: "Tender Coconut Cake", price: 22000, category: "Cakes" },

  { id: "pastry-croissant", name: "Butter Croissant", price: 11000, category: "Pastries" },
  { id: "pastry-danish", name: "Almond Danish", price: 14000, category: "Pastries" },
  { id: "pastry-eclair", name: "Chocolate Éclair", price: 13000, category: "Pastries" },
  { id: "pastry-cinnamon", name: "Cinnamon Roll", price: 12000, category: "Pastries" },

  { id: "cookie-double-choc", name: "Double Chocolate Cookie", price: 7000, category: "Cookies" },
  { id: "cookie-oatmeal", name: "Oatmeal Raisin Cookie", price: 6500, category: "Cookies" },
  { id: "cookie-caramel", name: "Salted Caramel Cookie", price: 7500, category: "Cookies" },
  { id: "cookie-brownie", name: "Fudge Brownie Square", price: 9000, category: "Cookies" },

  { id: "drink-filter-coffee", name: "Filter Coffee", price: 8000, category: "Beverages" },
  { id: "drink-cold-brew", name: "Cold Brew", price: 16000, category: "Beverages" },
  { id: "drink-chai", name: "Masala Chai", price: 6000, category: "Beverages" },
  { id: "drink-lime-soda", name: "Fresh Lime Soda", price: 9000, category: "Beverages" },
];

export const CATALOG_BY_ID = new Map(CATALOG.map((item) => [item.id, item]));

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
