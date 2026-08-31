import Image from "next/image";
import Link from "next/link";

import type { PosUser } from "@/lib/auth/tokens";

import { signOut } from "./actions";

/**
 * The sections, grouped the way the shop thinks about them rather than in one
 * flat list. Seven destinations is past the point where a row of pills reads as
 * a set of choices — grouping is what makes the panel scannable instead of just
 * long.
 */
const GROUPS = [
  {
    label: "Counter",
    tabs: [{ href: "/pos", label: "Terminal" }],
  },
  {
    label: "Kitchen",
    tabs: [
      { href: "/pos/menu", label: "Menu" },
      { href: "/pos/inventory", label: "Inventory" },
      { href: "/pos/production", label: "Production" },
    ],
  },
  {
    label: "Office",
    tabs: [
      { href: "/pos/expenses", label: "Expenses" },
      { href: "/pos/reports", label: "Reports" },
      { href: "/pos/tasks", label: "Board" },
    ],
  },
] as const;

export type PosTab = (typeof GROUPS)[number]["tabs"][number]["href"];

/**
 * Shared chrome for the signed-in POS screens: a navigation panel down the
 * side, and a slim bar across the top for the page's name and the account.
 *
 * Not in `layout.tsx` — that layout also wraps `/pos/login`, which by
 * definition has no user to render. The active tab arrives as a prop so this
 * stays a Server Component rather than pulling in `usePathname`.
 *
 * The panel is a side panel only where there is width for one. Below `md` it
 * lays itself back down across the top as a scrolling row of pills, which is
 * the same set of links in the only shape that fits a phone. Doing it in CSS
 * keeps the whole shell on the server and avoids the drawer problem — a panel
 * that opens over the page has to be told to close again on every navigation,
 * and forgets to exactly once.
 */
export default function PosShell({
  user,
  current,
  subtitle,
  children,
}: {
  user: PosUser;
  current: PosTab;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside
        aria-label="Sections"
        className="flex shrink-0 flex-col gap-3 border-b border-white/10 px-4 py-3 md:sticky md:top-0 md:h-dvh md:w-48 md:gap-6 md:overflow-y-auto md:border-r md:border-b-0 md:px-3 md:py-5 lg:w-52"
      >
        <div className="flex items-center gap-3 md:px-2">
          <Image src="/logo.png" alt="Delights" width={22} height={38} priority />
          <div>
            <p className="text-sm font-semibold tracking-tight">Delights</p>
            <p className="text-[0.6rem] font-medium tracking-[0.25em] text-accent uppercase">
              Point of sale
            </p>
          </div>
        </div>

        {/* One markup for both shapes: a row of groups that flow inline on a
            phone, a column of labelled groups once there is a panel to put
            them in. */}
        <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-col md:gap-5 md:overflow-x-visible md:px-0 md:pb-0">
          {GROUPS.map((group) => (
            <div key={group.label} className="flex gap-1.5 md:flex-col md:gap-0.5">
              <p className="hidden px-3 pb-1 text-[0.6rem] font-medium tracking-[0.2em] text-muted/50 uppercase md:block">
                {group.label}
              </p>
              {group.tabs.map((tab) => (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={current === tab.href ? "page" : undefined}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors md:w-full md:rounded-lg md:px-3 md:py-2 md:text-[0.8rem] ${
                    current === tab.href
                      ? "border-accent/40 bg-accent/15 text-accent"
                      : "border-white/10 text-muted hover:border-white/20 hover:text-foreground md:border-transparent md:hover:border-white/10 md:hover:bg-white/[0.04]"
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <p className="text-sm font-semibold tracking-tight">{subtitle}</p>

          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex size-8 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-xs font-semibold text-accent"
            >
              {(user.name ?? user.email).charAt(0).toUpperCase()}
            </span>
            <span className="hidden text-xs text-muted sm:inline">
              {user.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-full border border-white/10 px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-white/20 hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
