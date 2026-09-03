import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "POS — Delights",
  // Staff-only surface: keep it out of search results entirely.
  robots: { index: false, follow: false },
};

/**
 * Replaces the storefront's light viewport for everything under `/pos` —
 * viewport exports merge from the root segment down, and the deepest one to
 * name a field wins.
 *
 * `colorScheme: "dark"` is the half that does real work: it is what gets the
 * scrollbars, the `<select>` popups and the autofill styling drawn dark to
 * match the rest of the terminal. The theme colour stays the brand cream on
 * purpose, so a terminal saved to a home screen or pinned in a tab is the same
 * cream as the storefront.
 */
export const viewport: Viewport = {
  themeColor: "#FEEBBF",
  colorScheme: "dark",
};

/**
 * `theme-dark` is the whole of the POS's theming: it swaps the palette
 * variables back to the dark set for this subtree (see `globals.css`), and
 * lifts them to `:root` so `body` is painted dark as well.
 *
 * It has to be a wrapper rather than an attribute on `<html>` — that tag
 * belongs to the root layout, which is shared with the storefront. The flex
 * classes are only here to keep the chain intact: `body` is
 * `min-h-full flex flex-col` and the screens below claim `flex-1`, so an
 * unstyled wrapper in between would collapse them.
 */
export default function PosLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="theme-dark flex flex-1 flex-col">{children}</div>;
}
