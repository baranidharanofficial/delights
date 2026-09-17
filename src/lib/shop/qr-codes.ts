import "server-only";

import {
  FieldValue,
  Timestamp,
  type DocumentSnapshot,
} from "firebase-admin/firestore";

import { COLLECTIONS, getDb } from "@/lib/firebase/admin";

export type Actor = { email: string; name: string | null };

export type QrResult = { ok: true } | { ok: false; error: string };

/** Codes a shop prints — for flyers, table tents, a till receipt. Past this it's clutter, not a marketing kit. */
export const MAX_QR_CODES = 200;

/**
 * How far back the analytics on one code look.
 *
 * A code's `scanCount` is an exact, all-time total kept on its own document —
 * see `recordScan`. The breakdown by day and by device is rolled up in memory
 * from this many of its most recent scans instead, the same trade the daily
 * report makes with a day's orders. A code popular enough to scan past this
 * window in the last week will under-count that week and still show the
 * right all-time total.
 */
const MAX_SCANS_PER_CODE = 300;
const RECENT_SCANS_SHOWN = 15;

export const SCAN_DEVICES = ["mobile", "tablet", "desktop", "other"] as const;
export type ScanDevice = (typeof SCAN_DEVICES)[number];

/**
 * A rough device class from the scanning browser's User-Agent.
 *
 * This is a hint for the analytics panel, not a security or billing signal —
 * a spoofed or blank header just lands in "other" rather than breaking
 * anything.
 */
export function classifyDevice(userAgent: string | null): ScanDevice {
  if (!userAgent) return "other";
  const ua = userAgent.toLowerCase();

  if (/ipad|tablet(?!.*mobile)/.test(ua)) return "tablet";
  if (/mobi|iphone|android/.test(ua)) return "mobile";
  if (/mozilla|chrome|safari|firefox|edg\//.test(ua)) return "desktop";
  return "other";
}

/** Only http(s) may be printed on a flyer and handed to a stranger's camera. */
export function isTrackableUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export type QrScan = {
  atMs: number;
  device: ScanDevice;
  referrer: string | null;
  country: string | null;
};

export type QrCode = {
  id: string;
  label: string;
  targetUrl: string;
  createdAtMs: number;
  createdBy: Actor | null;
  /** Exact, all-time — see `recordScan`. */
  scanCount: number;
  lastScanAtMs: number | null;
  scansToday: number;
  scansLast7Days: number;
  deviceCounts: Record<ScanDevice, number>;
  recentScans: QrScan[];
};

function readMillis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

function readActor(value: unknown): Actor | null {
  if (typeof value !== "object" || value === null) return null;
  const { email, name } = value as { email?: unknown; name?: unknown };
  if (typeof email !== "string" || email === "") return null;
  return { email, name: typeof name === "string" ? name : null };
}

function readScan(doc: DocumentSnapshot): QrScan | null {
  const data = doc.data();
  if (!data) return null;
  const atMs = readMillis(data.at);
  if (atMs === null) return null;

  return {
    atMs,
    device: SCAN_DEVICES.includes(data.device) ? data.device : "other",
    referrer: typeof data.referrer === "string" ? data.referrer : null,
    country: typeof data.country === "string" ? data.country : null,
  };
}

function rollUp(scans: QrScan[]): Pick<
  QrCode,
  "scansToday" | "scansLast7Days" | "deviceCounts" | "recentScans"
> {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const deviceCounts = Object.fromEntries(
    SCAN_DEVICES.map((device) => [device, 0]),
  ) as Record<ScanDevice, number>;

  let scansToday = 0;
  let scansLast7Days = 0;

  for (const scan of scans) {
    deviceCounts[scan.device] += 1;
    const age = now - scan.atMs;
    if (age <= dayMs) scansToday += 1;
    if (age <= 7 * dayMs) scansLast7Days += 1;
  }

  return {
    scansToday,
    scansLast7Days,
    deviceCounts,
    recentScans: scans.slice(0, RECENT_SCANS_SHOWN),
  };
}

/**
 * Every QR code, newest first, each with its scan analytics rolled up.
 *
 * One query per code for its scans, sorted in memory rather than with
 * `orderBy`: pairing the `qrId` equality filter with a sort on `at` needs a
 * composite index, and — as with `getOrdersForDate` — a shop's printed codes
 * don't see enough volume to justify a deploy step for one. Only the most
 * recent `MAX_SCANS_PER_CODE` are kept once sorted, which is what bounds the
 * analytics rather than the read.
 */
export async function listQrCodes(): Promise<QrCode[]> {
  const db = getDb();

  const snapshot = await db.collection(COLLECTIONS.qrCodes).get();
  const codes = snapshot.docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .sort(
      (a, b) =>
        (readMillis(b.data.createdAt) ?? 0) - (readMillis(a.data.createdAt) ?? 0),
    )
    .slice(0, MAX_QR_CODES);

  return Promise.all(
    codes.map(async ({ id, data }) => {
      const scansSnapshot = await db
        .collection(COLLECTIONS.qrScans)
        .where("qrId", "==", id)
        .get();

      const scans = scansSnapshot.docs
        .map(readScan)
        .filter((scan): scan is QrScan => scan !== null)
        .sort((a, b) => b.atMs - a.atMs)
        .slice(0, MAX_SCANS_PER_CODE);

      return {
        id,
        label: typeof data.label === "string" ? data.label : "",
        targetUrl: typeof data.targetUrl === "string" ? data.targetUrl : "",
        createdAtMs: readMillis(data.createdAt) ?? 0,
        createdBy: readActor(data.createdBy),
        scanCount: typeof data.scanCount === "number" ? data.scanCount : 0,
        lastScanAtMs: readMillis(data.lastScanAt),
        ...rollUp(scans),
      };
    }),
  );
}

export type QrCodeInput = { label: string; targetUrl: string };

export async function createQrCode(
  input: QrCodeInput,
  actor: Actor,
): Promise<QrResult> {
  const label = input.label.trim();
  if (label === "") return { ok: false, error: "Give the code a label." };

  const targetUrl = input.targetUrl.trim();
  if (!isTrackableUrl(targetUrl)) {
    return { ok: false, error: "Enter a full http:// or https:// link." };
  }

  const db = getDb();
  const existing = await db.collection(COLLECTIONS.qrCodes).count().get();
  if (existing.data().count >= MAX_QR_CODES) {
    return {
      ok: false,
      error: `You've hit ${MAX_QR_CODES} QR codes. Delete one you no longer use first.`,
    };
  }

  await db.collection(COLLECTIONS.qrCodes).add({
    label,
    targetUrl,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actor,
    scanCount: 0,
    lastScanAt: null,
  });

  return { ok: true };
}

export async function deleteQrCode(id: string): Promise<QrResult> {
  const db = getDb();

  // The scan log is this code's whole reason for existing once it's gone —
  // left behind, it would just be an orphaned pile no screen ever reads again.
  // Capped at 499 so the code's own delete still fits in the same batch —
  // Firestore caps a batch at 500 writes. A code scanned more than that in
  // its lifetime leaves a remainder behind; harmless, since nothing queries
  // `qrScans` except by a `qrId` that no longer resolves to anything.
  const scans = await db
    .collection(COLLECTIONS.qrScans)
    .where("qrId", "==", id)
    .limit(499)
    .get();

  const batch = db.batch();
  for (const doc of scans.docs) batch.delete(doc.ref);
  batch.delete(db.collection(COLLECTIONS.qrCodes).doc(id));
  await batch.commit();

  return { ok: true };
}

export type ScanMeta = {
  userAgent: string | null;
  referrer: string | null;
  country: string | null;
};

/**
 * Logs a scan and hands back where it should redirect to, or `null` for an
 * id that doesn't exist (or was deleted) so the route can 404 instead of
 * sending someone nowhere.
 *
 * Not run in a transaction: a scan landing microseconds either side of the
 * counter it increments is invisible to anyone reading the numbers, and a
 * printed flyer scanned at a market stall is exactly the write that must not
 * be allowed to fail because of lock contention.
 */
export async function recordScan(
  id: string,
  meta: ScanMeta,
): Promise<string | null> {
  const db = getDb();
  const ref = db.collection(COLLECTIONS.qrCodes).doc(id);

  const snapshot = await ref.get();
  const targetUrl = snapshot.data()?.targetUrl;
  if (typeof targetUrl !== "string" || targetUrl === "") return null;

  await Promise.all([
    ref.update({
      scanCount: FieldValue.increment(1),
      lastScanAt: FieldValue.serverTimestamp(),
    }),
    db.collection(COLLECTIONS.qrScans).add({
      qrId: id,
      at: FieldValue.serverTimestamp(),
      device: classifyDevice(meta.userAgent),
      referrer: meta.referrer,
      country: meta.country,
    }),
  ]);

  return targetUrl;
}
