"use client";

import { useState } from "react";

export default function NotifyForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <p className="mx-auto flex h-13 max-w-md items-center justify-center rounded-full border border-accent/30 bg-accent/10 px-6 text-sm text-accent-strong">
        You&apos;re on the list — we&apos;ll be in touch soon.
      </p>
    );
  }

  return (
    <form
      className="mx-auto flex w-full max-w-md items-center gap-2 rounded-full border border-line bg-surface p-1.5 backdrop-blur-sm transition-colors focus-within:border-accent/60"
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) setSubmitted(true);
      }}
    >
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email address"
        className="min-w-0 flex-1 bg-transparent px-4 text-sm text-foreground placeholder:text-muted/60 focus:outline-none"
      />
      <button
        type="submit"
        className="shrink-0 rounded-full bg-accent-strong px-5 py-2.5 text-sm font-medium text-background transition-all hover:brightness-110 active:scale-[0.98]"
      >
        Notify me
      </button>
    </form>
  );
}
