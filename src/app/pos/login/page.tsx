import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";

import { POS_PATH, type LoginError } from "@/lib/auth/config";
import { getPosUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "POS sign in — Delights",
};

const ERROR_MESSAGES: Record<LoginError, string> = {
  forbidden: "That Google account isn't authorised for the POS.",
  expired: "That sign-in attempt expired. Please try again.",
  denied: "Sign-in was cancelled.",
  misconfigured:
    "Google sign-in isn't configured on this server. Check the GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and SESSION_SECRET environment variables.",
  failed: "Something went wrong signing you in. Please try again.",
};

function messageFor(error: string | undefined): string | null {
  if (!error) return null;
  return ERROR_MESSAGES[error as LoginError] ?? ERROR_MESSAGES.failed;
}

export default async function PosLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getPosUser()) redirect(POS_PATH);

  const { error } = await searchParams;
  const message = messageFor(error);

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-[120px]"
      />

      <div className="rise relative w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-sm">
        <Image
          src="/logo.png"
          alt="Delights"
          width={46}
          height={80}
          priority
          className="mx-auto"
        />

        <p className="mt-8 text-xs font-medium tracking-[0.3em] text-accent uppercase">
          Point of sale
        </p>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">
          Staff sign in
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          This terminal is restricted to the authorised store account.
        </p>

        {message && (
          <p
            role="alert"
            className="mt-6 rounded-lg border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200"
          >
            {message}
          </p>
        )}

        <a
          href="/api/auth/google/login"
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-all hover:brightness-110 active:scale-[0.98]"
        >
          <GoogleMark />
          Continue with Google
        </a>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="size-[18px]">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
