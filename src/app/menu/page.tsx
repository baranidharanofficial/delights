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

export default async function MenuPage() {
  const { categories, items } = await getMenu();
  const sections = toSections(categories, items);

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(ellipse_at_top,rgba(222,184,135,0.08),transparent_65%)]"
      />

      <div className="relative mx-auto w-full max-w-5xl px-6 pt-16 pb-24">
        <header className="flex flex-col items-center text-center">
          <Image
            src="/logo.png"
            alt=""
            width={48}
            height={83}
            priority
            className="drop-shadow-[0_0_30px_rgba(222,184,135,0.2)]"
          />
          <p className="mt-8 text-xs font-medium tracking-[0.35em] text-accent uppercase">
            Our menu
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Baked fresh, every day
          </h1>
        </header>

        {sections.length === 0 ? (
          <p className="mt-20 text-center text-base text-muted">
            The menu is being updated. Please check back shortly.
          </p>
        ) : (
          <>
            {/* Jump links. A bakery menu is long on a phone, and the sections
                are the only structure worth navigating by. */}
            <nav
              aria-label="Menu sections"
              className="sticky top-0 z-10 -mx-6 mt-12 overflow-x-auto border-b border-white/10 bg-background/80 px-6 py-3 backdrop-blur"
            >
              <ul className="flex gap-2">
                {sections.map(({ category }) => (
                  <li key={category.id}>
                    <a
                      href={`#category-${category.id}`}
                      className="block rounded-full border border-white/10 px-4 py-1.5 text-sm whitespace-nowrap text-muted transition-colors hover:border-accent/40 hover:text-foreground"
                    >
                      {category.name}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {sections.map(({ category, items: sectionItems }) => (
              <section
                key={category.id}
                id={`category-${category.id}`}
                className="mt-16 scroll-mt-20"
              >
                <h2 className="text-xs font-medium tracking-[0.3em] text-accent uppercase">
                  {category.name}
                </h2>

                <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {sectionItems.map((item) => {
                    const soldOut = isSoldOut(item);

                    return (
                      <li
                        key={item.id}
                        className={`flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] ${
                          soldOut ? "opacity-50" : ""
                        }`}
                      >
                        {item.imageKey && (
                          // Plain <img>, matching the terminal: these are served
                          // by /api/images out of a private bucket rather than
                          // from /public, so there is nothing for the optimizer
                          // to pre-size at build time.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/images/${item.imageKey}`}
                            alt=""
                            loading="lazy"
                            className="h-40 w-full object-cover"
                          />
                        )}

                        <div className="flex flex-1 items-baseline justify-between gap-4 p-4">
                          <h3 className="text-base leading-6 font-medium">
                            {item.name}
                          </h3>
                          {soldOut ? (
                            <span className="text-[0.65rem] tracking-wider whitespace-nowrap text-muted uppercase">
                              Sold out
                            </span>
                          ) : (
                            <span className="text-base whitespace-nowrap text-accent">
                              {formatMoney(item.price)}
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
          </>
        )}
      </div>
    </main>
  );
}
