import Image from "next/image";

import { requirePosUser } from "@/lib/auth/session";

import { signOut } from "./actions";
import PosTerminal from "./terminal";

export default async function PosPage() {
  // Authoritative check — the proxy gate is only an optimisation.
  const user = await requirePosUser();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Delights" width={22} height={38} priority />
          <div>
            <p className="text-[0.65rem] font-medium tracking-[0.25em] text-accent uppercase">
              Point of sale
            </p>
            <p className="text-sm font-semibold tracking-tight">Counter 1</p>
          </div>
        </div>

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

      <PosTerminal />
    </div>
  );
}
