import type { Metadata } from "next";
import Image from "next/image";

import { LAUNCH_CAP_LABEL, LAUNCH_OFFER_LABEL } from "@/lib/shop/launch-offer";

import ClaimForm from "./claim-form";

export const metadata: Metadata = {
  title: `Launch day — ${LAUNCH_OFFER_LABEL}`,
  description: `Leave your number and get a code for ${LAUNCH_OFFER_LABEL} on our launch day. Open to ${LAUNCH_CAP_LABEL} only.`,
};

/**
 * Static, deliberately.
 *
 * Nothing here is read from Firestore — the page is copy plus a form, and the
 * only trip to the server is the claim itself. That keeps the page instant
 * under whatever burst of traffic the launch announcement brings, which is the
 * one moment it has to hold up.
 */

/** The three lines under the form: what happens, in the order it happens. */
const STEPS = [
  { title: "Leave your number", body: "One field. No app, no signup, no spam." },
  { title: "Get your code", body: "Six characters, shown straight away on this page." },
  {
    title: "Show it at the counter",
    body: "Any milkshake on the menu, free, on launch day.",
  },
];

export default function LaunchPage() {
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

        <p
          className="rise mt-12 text-xs font-medium tracking-[0.35em] text-accent-strong uppercase"
          style={{ animationDelay: "0.25s" }}
        >
          Launch day offer
        </p>

        <h1
          className="rise mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
          style={{ animationDelay: "0.4s" }}
        >
          Your first milkshake is on us
        </h1>

        <p
          className="rise mt-5 max-w-md text-base leading-7 text-muted"
          style={{ animationDelay: "0.55s" }}
        >
          We open soon, and the milkshakes are on us for{" "}
          {LAUNCH_CAP_LABEL}. Leave yours and we&apos;ll hand you a code for one
          free milkshake — any one on the menu.
        </p>

        <div className="rise mt-10 w-full" style={{ animationDelay: "0.7s" }}>
          <ClaimForm />
        </div>

        <ul
          className="rise mt-14 grid w-full gap-8 text-center sm:grid-cols-3 sm:gap-6"
          style={{ animationDelay: "0.85s" }}
        >
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <span
                aria-hidden
                className="mx-auto flex h-7 w-7 items-center justify-center rounded-full border border-accent/40 text-xs text-accent-strong"
              >
                {index + 1}
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
          One code per number, one free milkshake per code, on launch day, in
          store — open to{" "}
          {LAUNCH_CAP_LABEL}. The rest of the menu is at its usual price, and
          we&apos;ll only use your number to tell you when we open.
        </p>
      </div>
    </main>
  );
}
