"use client";

import { useActionState, useMemo, useState } from "react";

import { EMPTY_FORM_STATE } from "../form-state";
import { Alert, FIELD, SubmitButton } from "../form-ui";
import { redeemCode, undoRedeem } from "./actions";

/**
 * One signup, already formatted for display.
 *
 * The dates and the phone number are turned into strings on the server rather
 * than here, which keeps `launch-signups.ts` — a `server-only` module — out of
 * this bundle entirely. `phone` survives as the raw document id because the
 * actions need something to address a row by.
 */
export type CodeRow = {
  phone: string;
  phoneLabel: string;
  code: string;
  claimedLabel: string;
  redeemed: { atLabel: string; byLabel: string } | null;
};

/**
 * Letters and digits only, upper-cased.
 *
 * A code is read off a customer's phone and typed in a hurry, so "abc 123" has
 * to find `ABC123`. Stripping punctuation is also what lets a number be pasted
 * in any of the shapes the signup form accepted.
 */
function normalizeQuery(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function CodeRowItem({ row }: { row: CodeRow }) {
  const [redeemState, redeem] = useActionState(redeemCode, EMPTY_FORM_STATE);
  const [undoState, undo] = useActionState(undoRedeem, EMPTY_FORM_STATE);

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span
          className={`font-mono text-base font-semibold tracking-[0.15em] ${
            row.redeemed ? "text-muted" : ""
          }`}
        >
          {row.code}
        </span>
        <span className="text-xs text-muted tabular-nums">{row.phoneLabel}</span>
        <span className="text-xs text-muted/60">
          claimed {row.claimedLabel}
        </span>

        <div className="ml-auto flex items-center gap-3">
          {row.redeemed ? (
            <>
              <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[0.65rem] font-medium text-accent">
                Redeemed
              </span>
              <form action={undo}>
                <input type="hidden" name="phone" value={row.phone} />
                <SubmitButton size="auto" label={`Undo redemption of ${row.code}`}>
                  Undo
                </SubmitButton>
              </form>
            </>
          ) : (
            <form action={redeem}>
              <input type="hidden" name="phone" value={row.phone} />
              <SubmitButton
                variant="primary"
                size="auto"
                label={`Redeem ${row.code}`}
              >
                Redeem
              </SubmitButton>
            </form>
          )}
        </div>
      </div>

      {row.redeemed && (
        <p className="mt-1 text-[0.7rem] text-muted/70">
          Handed over {row.redeemed.atLabel} by {row.redeemed.byLabel}
        </p>
      )}

      {/* Only ever one of the two can have failed — the row shows one button. */}
      <Alert message={redeemState.error ?? undoState.error} />
    </li>
  );
}

export default function CodeList({ rows }: { rows: CodeRow[] }) {
  const [query, setQuery] = useState("");

  const needle = normalizeQuery(query);
  const shown = useMemo(
    () =>
      needle === ""
        ? rows
        : rows.filter(
            (row) => row.code.includes(needle) || row.phone.includes(needle),
          ),
    [rows, needle],
  );

  if (rows.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-muted">
        No codes claimed yet.
      </p>
    );
  }

  return (
    <>
      {/* Filtered in the browser, not on the server. The whole list is at most a
          hundred rows and already here, so a code narrows to its row as the
          cashier types rather than a round trip per keystroke. */}
      <div className="border-b border-white/10 px-5 py-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a code or a number…"
          aria-label="Search launch codes"
          autoComplete="off"
          className={`${FIELD} w-full font-mono tracking-wider`}
        />
      </div>

      {shown.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">
          Nothing matches that code or number.
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06] px-5">
          {shown.map((row) => (
            <CodeRowItem key={row.phone} row={row} />
          ))}
        </ul>
      )}
    </>
  );
}
