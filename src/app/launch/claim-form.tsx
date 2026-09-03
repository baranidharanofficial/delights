"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { LAUNCH_DISCOUNT_LABEL } from "@/lib/shop/launch-offer";

import { claimOffer } from "./actions";
import { IDLE_CLAIM, type ClaimState } from "./claim-state";

/**
 * `useFormStatus` reads the form this button is rendered inside, which is what
 * lets the label change without the parent having to thread the pending state
 * down to it.
 */
function ClaimButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-full bg-accent-strong px-5 py-2.5 text-sm font-medium text-background transition-all hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
    >
      {pending ? "Sending…" : "Get my code"}
    </button>
  );
}

/** The code, spaced out — six characters read across a counter, not a word. */
function Claimed({ state }: { state: Extract<ClaimState, { status: "claimed" }> }) {
  return (
    <div
      className="mx-auto w-full max-w-md rounded-2xl border border-accent/30 bg-accent/[0.09] p-6 text-center"
      // Announced rather than silently swapped in: the form it replaces is
      // where the keyboard focus still is.
      role="status"
      aria-live="polite"
    >
      <p className="text-xs font-medium tracking-[0.25em] text-accent-strong uppercase">
        {state.returning ? "Already yours" : "You're in"}
      </p>

      <p className="mt-4 font-mono text-3xl font-semibold tracking-[0.2em] text-foreground">
        {state.code}
      </p>

      <p className="mt-4 text-sm leading-6 text-muted">
        Show this code at the counter on launch day for{" "}
        <span className="text-foreground">
          {LAUNCH_DISCOUNT_LABEL} every milkshake
        </span>
        . Saved
        against {state.phone}.
      </p>
    </div>
  );
}

export default function ClaimForm() {
  const [state, action] = useActionState(claimOffer, IDLE_CLAIM);

  if (state.status === "claimed") return <Claimed state={state} />;

  return (
    <div className="mx-auto w-full max-w-md">
      <form action={action} className="flex flex-col gap-3 sm:gap-2">
        <div className="flex items-center gap-2 rounded-full border border-line bg-surface p-1.5 backdrop-blur-sm transition-colors focus-within:border-accent/60">
          <span
            aria-hidden
            className="shrink-0 pl-4 text-sm text-muted select-none"
          >
            +91
          </span>
          <input
            name="phone"
            type="tel"
            required
            // `numeric` rather than `tel`: the tel keypad on Android hides the
            // digits behind a letter grid on some keyboards, and this field
            // takes nothing but digits.
            inputMode="numeric"
            autoComplete="tel-national"
            // Enough room for a number typed with spaces or a +91 in front,
            // both of which the server folds back to the same ten digits.
            maxLength={16}
            placeholder="98765 43210"
            aria-label="Mobile number"
            aria-invalid={state.status === "error"}
            className="min-w-0 flex-1 bg-transparent px-1 text-sm text-foreground placeholder:text-muted/60 focus:outline-none"
          />
          <ClaimButton />
        </div>

        {/* Bots fill every field they find; nobody else can reach this one. */}
        <div aria-hidden className="hidden">
          <label htmlFor="company">Company</label>
          <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
        </div>
      </form>

      {state.status === "error" && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-800/25 bg-red-800/10 px-3 py-2 text-center text-xs text-red-800"
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
