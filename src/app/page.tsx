import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-16">
      {/* ambient glow behind the logo — the brand red at low alpha, which on
          the cream reads as a warm halo rather than a coloured blob */}
      <div
        aria-hidden
        className="glow-pulse pointer-events-none absolute top-1/2 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--glow),transparent_60%)]"
      />

      <div className="relative flex w-full max-w-xl flex-col items-center text-center">
        <div className="rise" style={{ animationDelay: "0.1s" }}>
          {/* The mark is a full-bleed square tile, so the corner radius and
              the shadow are what make it sit on the page as a logo rather than
              as a red rectangle someone dropped in. */}
          <Image
            src="/Logo.png"
            alt="Logo"
            width={112}
            height={112}
            priority
            className="rounded-[1.75rem] shadow-[0_14px_36px_-10px_rgba(239,48,0,0.5)]"
          />
        </div>

        <h1
          className="rise mt-10 text-5xl font-semibold tracking-tight sm:text-6xl"
          style={{ animationDelay: "0.25s" }}
        >
          Delights
        </h1>

        <p
          className="rise mt-5 max-w-sm text-base leading-7 text-muted"
          style={{ animationDelay: "0.4s" }}
        >
          Milkshakes, snacks and fresh-baked everything.
        </p>

        {/* Stacked full-width on a phone, side by side once there is room for
            both to stay comfortably tappable. The offer is the filled one: it
            is the errand with a deadline on it, and the menu is always there. */}
        <div
          className="rise mt-11 flex w-full max-w-sm flex-col gap-3 sm:w-auto sm:flex-row sm:gap-4"
          style={{ animationDelay: "0.55s" }}
        >
          <Link
            href="/menu"
            className="rounded-full border border-line bg-surface px-7 py-3 text-sm font-medium text-foreground backdrop-blur-sm transition-all hover:border-accent/60 active:scale-[0.98]"
          >
            Go to Menu
          </Link>
          <Link
            href="/launch"
            className="rounded-full bg-accent-strong px-7 py-3 text-sm font-medium text-background transition-all hover:brightness-110 active:scale-[0.98]"
          >
            Get Launch offer
          </Link>
        </div>
      </div>

      <footer className="rise absolute bottom-8 text-xs tracking-wide text-muted/70">
        &copy; {new Date().getFullYear()} — All rights reserved
      </footer>
    </main>
  );
}
