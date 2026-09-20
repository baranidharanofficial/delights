import type { Metadata } from "next";
import Image from "next/image";

import {
  FLAT_DISCOUNT_OFFER_LABEL,
  FLAT_DISCOUNT_SHORT_LABEL,
  FLAT_DISCOUNT_SIGNUPS,
  LAUNCH_CAP_LABEL,
  LAUNCH_OFFER_LABEL,
  MAX_SIGNUPS,
  TOTAL_SIGNUPS,
} from "@/lib/shop/launch-offer";
import { getLaunchAvailability } from "@/lib/shop/launch-signups";

import ClaimForm from "./claim-form";

export const metadata: Metadata = {
  title: `Launch day — ${LAUNCH_OFFER_LABEL}`,
  description: `Leave your number and get a code for ${LAUNCH_OFFER_LABEL} on our launch day. Open to ${TOTAL_SIGNUPS} numbers total.`,
};

/**
 * Live, on a short cache, rather than fully static.
 *
 * The coupon tier is never named until the milkshake tier is actually full,
 * and "48 free left" has to count down as people claim — neither is possible
 * from fixed copy. `revalidate` keeps the one Firestore read this needs off
 * the hot path of every request during a launch-day burst: Next serves the
 * cached page for this long before re-fetching, so the number on screen can
 * be a few seconds stale. That is the same trade `claimLaunchOffer` already
 * makes with its own capacity check, just visible here instead of silent.
 */
export const revalidate = 20;

/** A few milkshakes drifting behind the copy — decorative, so screen readers skip them entirely. */
const FLOATING_SHAKES = [
  { emoji: "🍓", className: "top-[8%] left-[10%] text-3xl", delay: "0s" },
  { emoji: "🍫", className: "top-[18%] right-[8%] text-2xl", delay: "0.6s" },
  { emoji: "🍌", className: "bottom-[22%] left-[6%] text-2xl", delay: "1.1s" },
  { emoji: "🥤", className: "right-[10%] bottom-[12%] text-3xl", delay: "1.6s" },
];

export default async function LaunchPage() {
  const { milkshakesRemaining, milkshakeTierFull, couponsRemaining, soldOut } =
    await getLaunchAvailability();

  const badgeText = soldOut
    ? "All launch spots are claimed"
    : milkshakeTierFull
      ? `${couponsRemaining} left at ${FLAT_DISCOUNT_SHORT_LABEL}`
      : `${milkshakesRemaining} free milkshake${milkshakesRemaining === 1 ? "" : "s"} left`;

  const steps = [
    { icon: "📱", title: "Leave your number", body: "One field. No app, no signup, no spam." },
    { icon: "🎟️", title: "Get your code", body: "Six characters, shown straight away on this page." },
    {
      icon: "🥤",
      title: "Show it at the counter",
      body: milkshakeTierFull
        ? `${FLAT_DISCOUNT_SHORT_LABEL}, on launch day.`
        : "Any milkshake on the menu, free, on launch day.",
    },
  ];

  return (
    <main className="relative flex flex-1 flex-col items-center overflow-hidden px-6 py-16">
      {/* Same ambient treatment as the home page — this is the page the
          announcement links to, and it should read as the same shop. */}
      <div
        aria-hidden
        className="glow-pulse pointer-events-none absolute top-0 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-accent/15 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--glow),transparent_60%)]"
      />

      {FLOATING_SHAKES.map((shake) => (
        <span
          key={shake.emoji}
          aria-hidden
          className={`float pointer-events-none absolute select-none opacity-70 ${shake.className}`}
          style={{ animationDelay: shake.delay }}
        >
          {shake.emoji}
        </span>
      ))}

      <div className="relative flex w-full max-w-xl flex-1 flex-col items-center justify-center text-center">
        <div className="rise" style={{ animationDelay: "0.1s" }}>
          <Image
            src="/Logo.png"
            alt="Logo"
            width={96}
            height={96}
            priority
            className="rounded-3xl shadow-[0_12px_32px_-10px_rgba(239,48,0,0.5)]"
          />
        </div>

        <div
          className="rise mt-8 flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-1.5"
          style={{ animationDelay: "0.2s" }}
        >
          <span className="badge-pulse h-2 w-2 rounded-full bg-accent-strong" aria-hidden />
          <span className="text-xs font-semibold tracking-wide text-accent-strong">
            {badgeText}
          </span>
        </div>

        <p
          className="rise mt-6 text-xs font-medium tracking-[0.35em] text-accent-strong uppercase"
          style={{ animationDelay: "0.3s" }}
        >
          Launch day offer
        </p>

        <h1
          className="rise mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
          style={{ animationDelay: "0.4s" }}
        >
          {milkshakeTierFull ? "₹50 off your order, on us" : "Your first milkshake is on us"} 🎉
        </h1>

        <p
          className="rise mt-5 max-w-md text-base leading-7 text-muted"
          style={{ animationDelay: "0.55s" }}
        >
          {soldOut ? (
            <>
              All {TOTAL_SIGNUPS} launch spots are claimed. Come by on launch
              day anyway — we&apos;ll be making plenty.
            </>
          ) : milkshakeTierFull ? (
            <>
              We open soon, and the free milkshakes are already spoken for —
              but {FLAT_DISCOUNT_SIGNUPS} numbers can still get{" "}
              {FLAT_DISCOUNT_OFFER_LABEL} on launch day. Leave yours and
              we&apos;ll hand you a coupon code.
            </>
          ) : (
            <>
              We open soon, and {LAUNCH_CAP_LABEL} get {LAUNCH_OFFER_LABEL} on
              launch day. Leave yours and we&apos;ll hand you a code for one
              free milkshake, any one on the menu.
            </>
          )}
        </p>

        <div className="rise mt-10 w-full" style={{ animationDelay: "0.7s" }}>
          <ClaimForm />
        </div>

        <ul
          className="rise mt-14 grid w-full gap-8 text-center sm:grid-cols-3 sm:gap-6"
          style={{ animationDelay: "0.85s" }}
        >
          {steps.map((step) => (
            <li key={step.title} className="group">
              <span
                aria-hidden
                className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-accent/40 bg-accent/5 text-lg transition-transform duration-300 group-hover:scale-110"
              >
                {step.icon}
              </span>
              <h2 className="mt-3 text-sm font-medium">{step.title}</h2>
              <p className="mt-1.5 text-xs leading-5 text-muted">{step.body}</p>
            </li>
          ))}
        </ul>

        <p
          className="rise mt-14 max-w-md text-xs leading-5 text-muted/70"
          style={{ animationDelay: "1s" }}
        >
          {milkshakeTierFull ? (
            <>
              One code per number, redeemed once, on launch day, in store —{" "}
              {couponsRemaining} coupons left.
            </>
          ) : (
            <>
              One code per number, redeemed once, on launch day, in store —
              open to {MAX_SIGNUPS} numbers only.
            </>
          )}{" "}
          The rest of the menu is at its usual price, and we&apos;ll only use
          your number to tell you when we open.
        </p>
      </div>
    </main>
  );
}
