import { headers } from "next/headers";
import QRCode from "qrcode";

import { resolveOrigin } from "@/lib/auth/config";
import { requireSection } from "@/lib/auth/session";
import { businessDate, formatDayMonth, formatIstTime } from "@/lib/shop/dates";
import { listQrCodes, type QrCode } from "@/lib/shop/qr-codes";

import QrList, { type QrCodeRow } from "./qr-list";

import PosShell from "../shell";

function stamp(epochMs: number): string {
  return `${formatDayMonth(businessDate(new Date(epochMs)))} · ${formatIstTime(epochMs)}`;
}

function toRow(code: QrCode, redirectUrl: string): QrCodeRow {
  return {
    id: code.id,
    label: code.label,
    targetUrl: code.targetUrl,
    redirectUrl,
    createdLabel: stamp(code.createdAtMs),
    createdByLabel: code.createdBy?.name ?? code.createdBy?.email ?? "someone",
    scanCount: code.scanCount,
    lastScanLabel: code.lastScanAtMs === null ? null : stamp(code.lastScanAtMs),
    scansToday: code.scansToday,
    scansLast7Days: code.scansLast7Days,
    deviceCounts: code.deviceCounts,
    recentScans: code.recentScans.map((scan) => ({
      atLabel: stamp(scan.atMs),
      device: scan.device,
      referrer: scan.referrer,
      country: scan.country,
    })),
  };
}

export default async function QrCodesPage() {
  const user = await requireSection("/pos/qr");

  const [codes, headerList] = await Promise.all([listQrCodes(), headers()]);

  const origin = resolveOrigin(
    `${headerList.get("x-forwarded-proto") ?? "https"}://${headerList.get("host") ?? "localhost:3000"}`,
  );

  const rows = await Promise.all(
    codes.map(async (code) => {
      const redirectUrl = new URL(`/r/${code.id}`, origin).href;
      const svg = await QRCode.toString(redirectUrl, {
        type: "svg",
        margin: 1,
        color: { dark: "#33210e", light: "#ffffff" },
      });
      return { row: toRow(code, redirectUrl), svg };
    }),
  );

  const totalScans = codes.reduce((sum, code) => sum + code.scanCount, 0);
  const scansToday = codes.reduce((sum, code) => sum + code.scansToday, 0);

  return (
    <PosShell user={user} current="/pos/qr" subtitle="QR codes">
      <div className="flex flex-col gap-6 px-4 pb-8 sm:px-6">
        <section
          aria-label="Totals"
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <Tile label="Codes" value={String(codes.length)} />
          <Tile label="Total scans" value={String(totalScans)} />
          <Tile label="Scanned today" value={String(scansToday)} />
          <Tile
            label="Scanned this week"
            value={String(codes.reduce((sum, code) => sum + code.scansLast7Days, 0))}
          />
        </section>

        <QrList rows={rows} />
      </div>
    </PosShell>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="text-[0.65rem] tracking-wider text-muted/70 uppercase">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
