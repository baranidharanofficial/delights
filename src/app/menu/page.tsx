import type { Metadata } from "next";
import Image from "next/image";

import { getMenu } from "@/lib/shop/menu";
import { TAX_LABEL, formatMoney } from "@/lib/shop/money";
import type { Category, MenuItem } from "@/lib/shop/types";

export const metadata: Metadata = {
  title: "Menu",
  description: "Everything we bake, and what it costs.",
};

/**
 * Prerendered, and regenerated at most once a minute.
 *
 * Editing the menu pushes a fresh copy straight away — the POS actions call
 * `revalidatePath("/menu")`. The sold-out badges are the reason there is a timer
 * as well: stock also moves on every sale and every bake, and neither of those
 * paths revalidates a public page. A minute is the ceiling on how stale one of
 * those badges can be, not the delay on a price change.
 */
export const revalidate = 60;

type Section = { category: Category; items: MenuItem[] };

/**
 * The menu grouped into the sections a customer reads, empty ones dropped.
 *
 * Two kinds of item never appear. One taken off the menu by hand is withheld
 * deliberately, and an item whose category no longer exists is unreachable on
 * the terminal too — the POS refuses to delete a category still in use, so this
 * only happens after someone edits Firestore directly, and showing a customer
 * something the till cannot ring up would be the worse failure.
 */
function toSections(categories: Category[], items: MenuItem[]): Section[] {
  const grouped = new Map(categories.map((category) => [category.id, [] as MenuItem[]]));

  for (const item of items) {
    if (!item.available) continue;
    grouped.get(item.categoryId)?.push(item);
  }

  return categories
    .map((category) => ({ category, items: grouped.get(category.id) ?? [] }))
    .filter((section) => section.items.length > 0);
}

/** Tracked down to nothing on hand. Untracked items are always orderable. */
function isSoldOut(item: MenuItem): boolean {
  return item.stock !== null && item.stock <= 0;
}

/**
 * `formatMoney` with the paise dropped when there are none.
 *
 * A board price is written "₹59", not "₹59.00", and eighty-five rows of "​.00"
 * is just noise. Anything actually priced in paise still prints in full, so this
 * only ever removes a decimal that was carrying no information.
 */
function priceLabel(minor: number): string {
  return formatMoney(minor).replace(/\.00$/, "");
}

/** First letter of the name, for the stand-in tile. */
function initial(name: string): string {
  return (name.match(/[A-Za-z0-9]/)?.[0] ?? "•").toUpperCase();
}

/**
 * The item's photograph, or a stand-in until one is uploaded.
 *
 * Skipping the picture entirely when there is none leaves a ragged grid — a few
 * tall cards among short ones — which reads as broken rather than unfinished.
 * The stand-in holds exactly the same space and carries the item's initial, so
 * the rows stay even and the gap looks deliberate. It gives way to the real
 * photograph on its own, the moment `imageKey` is set from the menu screen.
 */
function Thumbnail({ item }: { item: MenuItem }) {
  if (item.imageKey === null) {
    return (
      <div
        aria-hidden
        className="flex h-40 w-full items-center justify-center border-b border-line bg-[radial-gradient(ellipse_at_center,var(--glow),transparent_70%)]"
      >
        <span className="text-5xl font-semibold text-accent/25 select-none">
          {initial(item.name)}
        </span>
      </div>
    );
  }

  return (
    // Plain <img>, matching the terminal: these are served by /api/images out
    // of a private bucket rather than from /public, so there is nothing for the
    // optimizer to pre-size at build time.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/images/${item.imageKey}`}
      alt=""
      loading="lazy"
      className="h-40 w-full object-cover"
    />
  );
}

export default async function MenuPage() {
  const { categories, items } = await getMenu();
  const sections = toSections(categories, items);

  return (
    // No `overflow-hidden` here, deliberately. An ancestor that clips becomes
    // the scroll container for anything `sticky` inside it, and since this one
    // never scrolls the section bar would simply slide away with the page. The
    // glow below is inset on both sides, so there is nothing to clip anyway.
    <main className="relative flex flex-1 flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(ellipse_at_top,var(--glow),transparent_65%)]"
      />

      <header className="relative mx-auto flex w-full max-w-5xl flex-col items-center px-6 pt-16 text-center">
        <Image
          src="/Logo.png"
          alt=""
          width={72}
          height={72}
          priority
          className="rounded-2xl shadow-[0_10px_26px_-10px_rgba(239,48,0,0.5)]"
        />
        <p className="mt-8 text-xs font-medium tracking-[0.35em] text-accent-strong uppercase">
          Our menu
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Baked fresh, every day
        </h1>
      </header>

      {sections.length === 0 ? (
        <p className="mx-auto mt-20 w-full max-w-5xl px-6 pb-24 text-center text-base text-muted">
          The menu is being updated. Please check back shortly.
        </p>
      ) : (
        <>
          {/* Thirteen sections and eighty-odd items: the jump links are the only
              practical way down the page, so they stay put once reached. The bar
              spans the viewport while its links stay on the same measure as the
              menu — a strip floating at the content width reads as a stray card. */}
          <nav
            aria-label="Menu sections"
            className="sticky top-0 z-10 mt-12 border-b border-line bg-background/85 backdrop-blur"
          >
            <div className="mx-auto w-full max-w-5xl overflow-x-auto px-6 py-3">
              <ul className="flex gap-2">
                {sections.map(({ category }) => (
                  <li key={category.id}>
                    <a
                      href={`#category-${category.id}`}
                      className="block rounded-full border border-line px-4 py-1.5 text-sm whitespace-nowrap text-muted transition-colors hover:border-accent/60 hover:text-foreground"
                    >
                      {category.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          <div className="relative mx-auto w-full max-w-5xl px-6 pb-24">
            {sections.map(({ category, items: sectionItems }) => (
              <section
                key={category.id}
                id={`category-${category.id}`}
                // Clears the bar the link just scrolled underneath.
                className="mt-16 scroll-mt-20"
              >
                <h2 className="text-xs font-medium tracking-[0.3em] text-accent-strong uppercase">
                  {category.name}
                </h2>

                <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {sectionItems.map((item) => {
                    const soldOut = isSoldOut(item);

                    return (
                      <li
                        key={item.id}
                        className={`flex flex-col overflow-hidden rounded-xl border border-line bg-surface ${
                          soldOut ? "opacity-50" : ""
                        }`}
                      >
                        <Thumbnail item={item} />

                        <div className="flex flex-1 items-baseline justify-between gap-4 p-4">
                          <h3 className="text-base leading-6 font-medium">
                            {item.name}
                          </h3>
                          {soldOut ? (
                            <span className="text-[0.65rem] tracking-wider whitespace-nowrap text-muted uppercase">
                              Sold out
                            </span>
                          ) : (
                            <span className="text-base whitespace-nowrap text-accent-strong">
                              {priceLabel(item.price)}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

            <p className="mt-20 text-center text-xs text-muted/70">
              Prices are exclusive of {TAX_LABEL}. Availability changes through
              the day.
            </p>
          </div>
        </>
      )}
    </main>
  );
}
