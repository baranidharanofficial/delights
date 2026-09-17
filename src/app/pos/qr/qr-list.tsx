"use client";

import { useActionState, useState } from "react";

import { EMPTY_FORM_STATE } from "../form-state";
import { Alert, FIELD, SubmitButton } from "../form-ui";
import { addQrCode, removeQrCode } from "./actions";

type ScanDevice = "mobile" | "tablet" | "desktop" | "other";

const DEVICE_LABELS: Record<ScanDevice, string> = {
  mobile: "Mobile",
  tablet: "Tablet",
  desktop: "Desktop",
  other: "Other",
};

/**
 * One code, already formatted for display — see `code-list.tsx` for why the
 * dates and the actor are turned into strings on the server rather than here.
 */
export type QrCodeRow = {
  id: string;
  label: string;
  targetUrl: string;
  /** The link actually printed on the code — a tracked redirect, not `targetUrl`. */
  redirectUrl: string;
  createdLabel: string;
  createdByLabel: string;
  scanCount: number;
  lastScanLabel: string | null;
  scansToday: number;
  scansLast7Days: number;
  deviceCounts: Record<ScanDevice, number>;
  recentScans: {
    atLabel: string;
    device: ScanDevice;
    referrer: string | null;
    country: string | null;
  }[];
};

function NewCodeForm() {
  const [state, submit] = useActionState(addQrCode, EMPTY_FORM_STATE);

  return (
    <div className="border-b border-white/10 px-5 py-3">
      <form action={submit} className="flex flex-wrap items-center gap-2">
        <input
          name="label"
          placeholder="What's this for — e.g. Instagram bio"
          aria-label="Label"
          className={`${FIELD} min-w-0 flex-1 basis-48`}
        />
        <input
          name="targetUrl"
          placeholder="https://…"
          aria-label="Destination URL"
          inputMode="url"
          className={`${FIELD} min-w-0 flex-1 basis-56`}
        />
        <SubmitButton variant="primary" size="auto">
          Generate
        </SubmitButton>
      </form>
      <Alert message={state.error} />
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard access can be denied by the browser; the link is
          // already on screen to select by hand, so there is nothing more
          // useful to do than say nothing went out.
        }
      }}
      className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted transition-colors hover:border-white/20 hover:text-foreground"
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

function DeviceBreakdown({ counts }: { counts: Record<ScanDevice, number> }) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (total === 0) {
    return <p className="text-xs text-muted/70">No scans yet.</p>;
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {(Object.keys(DEVICE_LABELS) as ScanDevice[])
        .filter((device) => counts[device] > 0)
        .map((device) => (
          <li
            key={device}
            className="rounded-full border border-white/10 px-2.5 py-1 text-[0.7rem] text-muted"
          >
            {DEVICE_LABELS[device]} · {counts[device]}
          </li>
        ))}
    </ul>
  );
}

function Detail({ row, svg }: { row: QrCodeRow; svg: string }) {
  const [deleteState, remove] = useActionState(removeQrCode, EMPTY_FORM_STATE);
  const downloadHref = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return (
    <div className="mt-3 flex flex-col gap-4 border-t border-white/[0.06] pt-3 sm:flex-row">
      <div className="flex shrink-0 flex-col items-center gap-2">
        <div
          // Generated entirely by the `qrcode` library from a URL this app
          // built itself — nothing here comes from unescaped user input.
          // The library omits a `width`/`height` attribute on the `<svg>` it
          // returns, so the child selector is what makes it fill this box
          // instead of falling back to the UA's default replaced-element size.
          dangerouslySetInnerHTML={{ __html: svg }}
          className="w-32 overflow-hidden rounded-lg bg-white p-2 [&>svg]:h-auto [&>svg]:w-full"
        />
        <a
          href={downloadHref}
          download={`${row.label || "qr-code"}.svg`}
          className="text-[0.7rem] text-accent hover:underline"
        >
          Download SVG
        </a>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 truncate rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs">
            {row.redirectUrl}
          </code>
          <CopyButton value={row.redirectUrl} />
        </div>
        <p className="mt-1.5 truncate text-[0.7rem] text-muted/70">
          Sends to {row.targetUrl}
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-white/10 px-2 py-1.5">
            <p className="text-sm font-semibold tabular-nums">{row.scanCount}</p>
            <p className="text-[0.6rem] tracking-wide text-muted/70 uppercase">
              All time
            </p>
          </div>
          <div className="rounded-lg border border-white/10 px-2 py-1.5">
            <p className="text-sm font-semibold tabular-nums">{row.scansToday}</p>
            <p className="text-[0.6rem] tracking-wide text-muted/70 uppercase">
              Today
            </p>
          </div>
          <div className="rounded-lg border border-white/10 px-2 py-1.5">
            <p className="text-sm font-semibold tabular-nums">
              {row.scansLast7Days}
            </p>
            <p className="text-[0.6rem] tracking-wide text-muted/70 uppercase">
              7 days
            </p>
          </div>
        </div>

        <div className="mt-3">
          <DeviceBreakdown counts={row.deviceCounts} />
        </div>

        {row.recentScans.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-[0.7rem] text-muted/80">
            {row.recentScans.map((scan, index) => (
              <li key={index} className="flex flex-wrap gap-x-2">
                <span className="tabular-nums">{scan.atLabel}</span>
                <span>· {DEVICE_LABELS[scan.device]}</span>
                {scan.country && <span>· {scan.country}</span>}
                {scan.referrer && (
                  <span className="min-w-0 truncate">· from {scan.referrer}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[0.7rem] text-muted/60">
            Made by {row.createdByLabel} · {row.createdLabel}
          </p>
          <form action={remove}>
            <input type="hidden" name="id" value={row.id} />
            <SubmitButton
              variant="danger"
              size="auto"
              label={`Delete ${row.label}`}
            >
              Delete
            </SubmitButton>
          </form>
        </div>
        <Alert message={deleteState.error} />
      </div>
    </div>
  );
}

function Row({ row, svg }: { row: QrCodeRow; svg: string }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="py-3">
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        className="flex w-full items-baseline gap-3 text-left text-sm"
      >
        <span className="min-w-0 flex-1 truncate font-medium">{row.label}</span>
        <span className="hidden shrink-0 truncate text-xs text-muted sm:inline sm:max-w-48">
          {row.targetUrl}
        </span>
        <span className="w-20 shrink-0 text-right text-xs text-muted">
          {row.lastScanLabel ? `last ${row.lastScanLabel}` : "never scanned"}
        </span>
        <span className="w-14 shrink-0 text-right font-medium tabular-nums">
          {row.scanCount}
        </span>
      </button>

      {open && <Detail row={row} svg={svg} />}
    </li>
  );
}

export default function QrList({
  rows,
}: {
  rows: { row: QrCodeRow; svg: string }[];
}) {
  return (
    <section
      aria-label="QR codes"
      className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-5 py-3">
        <h2 className="text-sm font-semibold tracking-wide">Codes</h2>
        <p className="text-[0.7rem] text-muted/70">
          Scans · Today · 7 days, tap a row for the code and its history.
        </p>
      </div>

      <NewCodeForm />

      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">
          No QR codes yet — generate one above.
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06] px-5">
          {rows.map(({ row, svg }) => (
            <Row key={row.id} row={row} svg={svg} />
          ))}
        </ul>
      )}
    </section>
  );
}
