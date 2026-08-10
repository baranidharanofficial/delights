"use client";

import { useFormStatus } from "react-dom";

/** Shared input styling for the admin forms. */
export const FIELD =
  "rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm placeholder:text-muted/60 focus:border-accent/40 focus:outline-none";

const VARIANTS = {
  quiet: "border-white/10 text-muted hover:border-white/20 hover:text-foreground",
  primary: "border-accent/40 bg-accent/15 text-accent hover:bg-accent/25",
  danger:
    "border-red-500/30 text-red-300/80 hover:border-red-500/60 hover:text-red-300",
} as const;

/**
 * Submit button that reports its own form's pending state.
 *
 * `useFormStatus` only reads the form it is rendered inside, which is what makes
 * one row's Save spin without freezing every other row on the screen.
 */
export function SubmitButton({
  children,
  variant = "quiet",
  size = "fixed",
  label,
}: {
  children: React.ReactNode;
  variant?: keyof typeof VARIANTS;
  /** `fixed` keeps table rows aligned under their column headers. */
  size?: "fixed" | "auto";
  label?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      className={`shrink-0 rounded-lg border py-1.5 text-center text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 ${
        size === "fixed" ? "w-14" : "px-3"
      } ${VARIANTS[variant]}`}
    >
      {pending ? "…" : children}
    </button>
  );
}

export function Alert({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <p
      role="alert"
      className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
    >
      {message}
    </p>
  );
}

/** Invisible stand-in that keeps a header row aligned over button columns. */
export function ButtonSpacer() {
  return (
    <span aria-hidden className="invisible w-14 shrink-0 py-1.5 text-xs">
      ✕
    </span>
  );
}
