import Image from "next/image";
import Link from "next/link";

import type { PosUser } from "@/lib/auth/tokens";

import { signOut } from "./actions";

const TABS = [
  { href: "/pos", label: "Terminal" },
  { href: "/pos/menu", label: "Menu" },
  { href: "/pos/reports", label: "Reports" },
] as const;

export type PosTab = (typeof TABS)[number]["href"];

/**
 * Shared chrome for the three signed-in POS screens.
 *
 * Not in `layout.tsx` — that layout also wraps `/pos/login`, which by definition
 * has no user to render. The active tab arrives as a prop so this stays a Server
 * Component rather than pulling in `usePathname`.
 */
export default function PosHeader({
  user,
  current,
  subtitle,
}: {
  user: PosUser;
  current: PosTab;
  subtitle: string;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <Image src="/logo.png" alt="Delights" width={22} height={38} priority />
        <div>
          <p className="text-[0.65rem] font-medium tracking-[0.25em] text-accent uppercase">
            Point of sale
          </p>
          <p className="text-sm font-semibold tracking-tight">{subtitle}</p>
        </div>
      </div>

      <nav className="flex gap-2" aria-label="Sections">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current === tab.href ? "page" : undefined}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
              current === tab.href
                ? "border-accent/40 bg-accent/15 text-accent"
                : "border-white/10 text-muted hover:border-white/20 hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-8 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-xs font-semibold text-accent"
        >
          {(user.name ?? user.email).charAt(0).toUpperCase()}
        </span>
        <span className="hidden text-xs text-muted sm:inline">{user.email}</span>
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
  );
}
