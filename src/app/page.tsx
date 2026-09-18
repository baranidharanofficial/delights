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

        {/* Secondary to the two CTAs above, not competing with them — a plain
            text link rather than another pill, with just enough weight (the
            star) to read as a rating action and not a third navigation choice. */}
        <a
          href="https://search.google.com/local/writereview?placeid=4943237105128049276"
          target="_blank"
          rel="noopener noreferrer"
          className="rise mt-8 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
          style={{ animationDelay: "0.7s" }}
        >
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 text-accent-strong"
          >
            <path d="M10 1.5l2.59 5.25 5.79.84-4.19 4.09.99 5.77L10 14.77l-5.18 2.68.99-5.77L1.62 7.59l5.79-.84L10 1.5z" />
          </svg>
          Rate us on Google
        </a>
      </div>

      <footer className="rise absolute bottom-8 text-xs tracking-wide text-muted/70">
        &copy; {new Date().getFullYear()} — All rights reserved
      </footer>
    </main>
  );
}
