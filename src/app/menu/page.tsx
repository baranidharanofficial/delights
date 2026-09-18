import type { Metadata } from "next";
import Image from "next/image";

import { getMenu } from "@/lib/shop/menu";
import { TAX_LABEL, formatMoney } from "@/lib/shop/money";
import type { Category, MenuItem } from "@/lib/shop/types";

import { SectionNav } from "./section-nav";

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
function Thumbnail({ item, soldOut }: { item: MenuItem; soldOut: boolean }) {
  if (item.imageKey === null) {
    return (
      <div
        aria-hidden
        className="flex h-44 w-full items-center justify-center border-b border-line bg-[radial-gradient(ellipse_at_center,var(--glow),transparent_70%)]"
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
      className={`h-44 w-full object-cover transition-transform duration-500 ${
        soldOut ? "grayscale" : "group-hover:scale-105"
      }`}
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
    // hero below clips itself instead.
    <main className="relative flex flex-1 flex-col">
      {/* Full-bleed photo banner. Fixed heights rather than an aspect ratio —
          this needs to read as a strip of the page at any width, not a photo
          that happens to be here, and an aspect ratio on a very wide viewport
          would blow it out of proportion with everything below it. */}
      <div className="relative h-[38vh] min-h-70 w-full overflow-hidden sm:h-[46vh]">
        <Image
          src="/menu-hero.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-t from-background via-background/55 to-black/25"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_40%,var(--background)_100%)] opacity-60"
        />

        <header className="relative mx-auto flex h-full w-full max-w-5xl flex-col items-center justify-end px-6 pb-8 text-center">
          <Image
            src="/Logo.png"
            alt=""
            width={64}
            height={64}
            priority
            className="rounded-2xl shadow-[0_10px_26px_-10px_rgba(239,48,0,0.5)]"
          />
          <p className="mt-6 text-xs font-medium tracking-[0.35em] text-accent-strong uppercase">
            Our menu
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Everything we bake
          </h1>
        </header>
      </div>

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
            className="sticky top-0 z-10 border-b border-line bg-background/85 backdrop-blur"
          >
            <div className="mx-auto w-full max-w-5xl overflow-x-auto px-6 py-3">
              <SectionNav
                sections={sections.map(({ category }) => ({
                  id: `category-${category.id}`,
                  name: category.name,
                }))}
              />
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

                <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {sectionItems.map((item) => {
                    const soldOut = isSoldOut(item);

                    return (
                      <li
                        key={item.id}
                        className={`group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-all duration-300 ${
                          soldOut
                            ? ""
                            : "hover:-translate-y-1 hover:border-accent/50 hover:shadow-[0_16px_32px_-18px_rgba(51,33,14,0.35)]"
                        }`}
                      >
                        <div className="relative overflow-hidden">
                          <Thumbnail item={item} soldOut={soldOut} />
                          {soldOut && (
                            <span className="absolute top-3 right-3 rounded-full bg-background/90 px-3 py-1 text-[0.65rem] font-medium tracking-wider text-muted uppercase shadow-sm">
                              Sold out
                            </span>
                          )}
                        </div>

                        <div className="flex flex-1 items-baseline justify-between gap-4 p-4">
                          <h3
                            className={`text-base leading-6 font-medium ${soldOut ? "text-muted" : ""}`}
                          >
                            {item.name}
                          </h3>
                          {!soldOut && (
                            <span className="text-base font-medium whitespace-nowrap text-accent-strong">
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
