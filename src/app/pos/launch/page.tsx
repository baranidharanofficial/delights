import { requirePosUser } from "@/lib/auth/session";
import { businessDate, formatDayMonth, formatIstTime } from "@/lib/shop/dates";
import { LAUNCH_OFFER_LABEL, MAX_SIGNUPS } from "@/lib/shop/launch-offer";
import {
  formatPhone,
  getLaunchSignups,
  type LaunchSignup,
} from "@/lib/shop/launch-signups";

import CodeList, { type CodeRow } from "./code-list";

import PosShell from "../shell";

/**
 * `3 Sep · 20:41`.
 *
 * The day is carried here, unlike on the daily report: codes are claimed over
 * whatever run-up the announcement gets, and "20:41" alone would say nothing
 * about which day a signup landed on.
 */
function stamp(epochMs: number): string {
  return `${formatDayMonth(businessDate(new Date(epochMs)))} · ${formatIstTime(epochMs)}`;
}

function toRow(signup: LaunchSignup): CodeRow {
  return {
    phone: signup.phone,
    phoneLabel: formatPhone(signup.phone),
    code: signup.code,
    // A signup read back in the instant before its `serverTimestamp` resolves
    // has no time yet, which arrives here as 0 rather than as a date in 1970.
    claimedLabel: signup.claimedAtMs === 0 ? "—" : stamp(signup.claimedAtMs),
    redeemed:
      signup.redeemedAtMs === null
        ? null
        : {
            atLabel: stamp(signup.redeemedAtMs),
            byLabel:
              signup.redeemedBy?.name ?? signup.redeemedBy?.email ?? "the counter",
          },
  };
}

export default async function LaunchCodesPage() {
  const user = await requirePosUser();
  const signups = await getLaunchSignups();

  const claimed = signups.length;
  const redeemed = signups.filter(
    (signup) => signup.redeemedAtMs !== null,
  ).length;

  return (
    <PosShell user={user} current="/pos/launch" subtitle="Launch codes">
      <div className="flex flex-col gap-6 px-4 pb-8 sm:px-6">
        <section
          aria-label="Offer totals"
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <Tile
            label="Claimed"
            value={`${claimed} / ${MAX_SIGNUPS}`}
            hint={claimed >= MAX_SIGNUPS ? "List is full" : undefined}
          />
          <Tile label="Redeemed" value={String(redeemed)} />
          <Tile
            label="Still to come"
            value={String(claimed - redeemed)}
            hint="Codes out, milkshake not yet handed over"
          />
          <Tile
            label="Codes left"
            value={String(Math.max(0, MAX_SIGNUPS - claimed))}
          />
        </section>

        <section
          aria-label="Codes"
          className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03]"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-5 py-3">
            <h2 className="text-sm font-semibold tracking-wide">Codes</h2>
            <p className="text-[0.7rem] text-muted/70">
              Each one is good for {LAUNCH_OFFER_LABEL}, once.
            </p>
          </div>

          <CodeList rows={signups.map(toRow)} />
        </section>
      </div>
    </PosShell>
  );
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="text-[0.65rem] tracking-wider text-muted/70 uppercase">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[0.65rem] text-muted/60">{hint}</p>}
    </div>
  );
}
