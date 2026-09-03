import Image from "next/image";
import NotifyForm from "./notify-form";

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

        <p
          className="rise mt-14 text-xs font-medium tracking-[0.35em] text-accent-strong uppercase"
          style={{ animationDelay: "0.25s" }}
        >
          Coming soon
        </p>

        <h1
          className="rise mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
          style={{ animationDelay: "0.4s" }}
        >
          Something new is on the way
        </h1>

        <p
          className="rise mt-5 max-w-md text-base leading-7 text-muted"
          style={{ animationDelay: "0.55s" }}
        >
          We&apos;re putting the finishing touches on something we can&apos;t
          wait to share. Leave your email and be the first to know.
        </p>

        <div className="rise mt-10 w-full" style={{ animationDelay: "0.7s" }}>
          <NotifyForm />
        </div>
      </div>

      <footer className="rise absolute bottom-8 text-xs tracking-wide text-muted/70">
        &copy; {new Date().getFullYear()} — All rights reserved
      </footer>
    </main>
  );
}
