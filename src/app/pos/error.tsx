"use client";

import { useEffect } from "react";

/**
 * Fallback for the whole /pos segment.
 *
 * The realistic failure here is Firestore: missing service-account credentials,
 * a revoked key, or the network being down mid-shift. Any of those would
 * otherwise surface as an unstyled crash on the counter screen.
 */
export default function PosError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-8 text-center">
        <p className="text-xs tracking-[0.2em] text-accent uppercase">
          Something broke
        </p>
        <h1 className="mt-2 text-base font-semibold tracking-tight">
          The counter could not reach its data
        </h1>
        <p className="mt-3 text-sm text-muted">
          Usually the database connection. Check that the{" "}
          <code className="text-foreground">FIREBASE_*</code> variables are set,
          then try again.
        </p>

        {/* Next redacts server error messages in production, leaving only the
            digest to correlate against the server log. */}
        {error.digest && (
          <p className="mt-3 font-mono text-[0.7rem] text-muted/60">
            {error.digest}
          </p>
        )}
        {process.env.NODE_ENV !== "production" && (
          <p className="mt-3 text-left font-mono text-[0.7rem] break-words text-muted/70">
            {error.message}
          </p>
        )}

        <button
          type="button"
          onClick={unstable_retry}
          className="mt-6 w-full rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-background transition-all hover:brightness-110 active:scale-[0.98]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
