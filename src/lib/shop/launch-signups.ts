import "server-only";

import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";

import { COLLECTIONS, getDb } from "@/lib/firebase/admin";

import { formatIstTime } from "./dates";
import { LAUNCH_DISCOUNT_PERCENT, MAX_SIGNUPS } from "./launch-offer";

/**
 * The launch-day milkshake offer.
 *
 * A customer leaves a phone number and gets a code back to show at the counter.
 * The number is the identity here, not the code: the code is a short handle
 * that is quick to read off a phone screen and quick to type, and guessing one
 * gains nothing that entering any number of your own would not also give you.
 * That is why nothing below treats it as a secret.
 */

/**
 * Ten digits, stored with the country code and without punctuation.
 *
 * Everything a customer might type — `+91 98765 43210`, `098765-43210`,
 * `9876543210` — has to land on the same document id, or the same person
 * collects a second code by typing their number a second way. Indian mobile
 * numbers are ten digits opening with 6–9, which is strict enough to catch a
 * landline or a number typed one digit short.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");

  const local =
    digits.length === 12 && digits.startsWith("91")
      ? digits.slice(2)
      : digits.length === 11 && digits.startsWith("0")
        ? digits.slice(1)
        : digits;

  if (!/^[6-9]\d{9}$/.test(local)) return null;

  return `91${local}`;
}

/** `+91 98765 43210` — the number read back to whoever typed it. */
export function formatPhone(normalized: string): string {
  const local = normalized.slice(2);
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
}

/**
 * No `B`/`8`, `I`/`1`, `O`/`0` or `S`/`5`.
 *
 * The code is read aloud across a counter as often as it is shown, and every
 * pair dropped here is an argument that will not happen during a rush.
 */
const ALPHABET = "ACDEFGHJKLMNPQRTUVWXYZ2346789";
const CODE_LENGTH = 6;

function generateCode(): string {
  const out: string[] = [];

  while (out.length < CODE_LENGTH) {
    const bytes = new Uint8Array(CODE_LENGTH);
    crypto.getRandomValues(bytes);

    for (const byte of bytes) {
      if (out.length === CODE_LENGTH) break;
      // 232 is the largest multiple of 29 under 256. Discarding the tail keeps
      // every letter equally likely, which costs a handful of extra bytes and
      // spares anyone the "why are there so many A's" question later.
      if (byte >= 232) continue;
      out.push(ALPHABET[byte % ALPHABET.length]);
    }
  }

  return out.join("");
}

export type ClaimResult =
  | { ok: true; code: string; phone: string; returning: boolean }
  | { ok: false; error: string };

function readCode(snapshot: DocumentSnapshot): string | null {
  const code = snapshot.data()?.code;
  return typeof code === "string" && code !== "" ? code : null;
}

/** Epoch milliseconds, or `null` for a field that is absent or still pending. */
function readMillis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

/** Whoever was signed in at the till, as it was written. */
function readActor(value: unknown): Actor | null {
  if (typeof value !== "object" || value === null) return null;

  const { email, name } = value as { email?: unknown; name?: unknown };
  if (typeof email !== "string" || email === "") return null;

  return { email, name: typeof name === "string" ? name : null };
}

/**
 * The signup, and the code that comes with it.
 *
 * Submitting twice is the normal case, not an error: people close the tab, or
 * come back on launch morning to find the code again. The phone number is the
 * document id precisely so that the second submission hands back the *same*
 * code rather than minting a rival one, and `returning` lets the page say so.
 *
 * The capacity count sits outside the transaction on purpose. A count read
 * inside one takes a lock on every document it matched — the whole collection,
 * here — which would put every simultaneous signup into a queue behind every
 * other. Outside, it is a stale number, so claims arriving together right at
 * the boundary can settle a few past `MAX_SIGNUPS`.
 *
 * That is the accepted trade rather than an oversight. An exact cap wants a
 * single counter document incremented inside the transaction, which locks one
 * document instead of the collection; worth adding the day the overshoot costs
 * more than the handful of extra milkshakes it stands for.
 */
export async function claimLaunchOffer(input: string): Promise<ClaimResult> {
  const phone = normalizePhone(input);
  if (phone === null) {
    return { ok: false, error: "Enter a 10-digit Indian mobile number." };
  }

  const db = getDb();
  const collection = db.collection(COLLECTIONS.launchSignups);
  const ref = collection.doc(phone);

  const total = (await collection.count().get()).data().count;
  const atCapacity = total >= MAX_SIGNUPS;

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);

    const existing = readCode(snapshot);
    if (existing !== null) {
      return { ok: true, code: existing, phone, returning: true };
    }

    if (atCapacity) {
      return {
        ok: false,
        error: `All ${MAX_SIGNUPS} free milkshakes are taken. Come by on the day anyway — we'll be making plenty.`,
      };
    }

    const code = generateCode();
    transaction.set(ref, {
      phone,
      code,
      claimedAt: FieldValue.serverTimestamp(),
      discountPercent: LAUNCH_DISCOUNT_PERCENT,
    });

    return { ok: true, code, phone, returning: false };
  });
}

/** Whoever was signed in at the till when a code was handed over. */
export type Actor = { email: string; name: string | null };

export type LaunchSignup = {
  phone: string;
  code: string;
  claimedAtMs: number;
  /** `null` until the milkshake is actually handed over. */
  redeemedAtMs: number | null;
  redeemedBy: Actor | null;
};

export type RedemptionResult = { ok: true } | { ok: false; error: string };

/**
 * Every signup, newest first — for whoever works the counter on the day.
 *
 * Nothing on the public site reads this; it backs `/pos/launch`. The whole list
 * comes back in one read rather than being searched in Firestore, because
 * `MAX_SIGNUPS` bounds it at a hundred rows: cheaper than a query, no index to
 * keep, and it lets the screen filter as the cashier types instead of once per
 * keystroke over the network.
 */
export async function getLaunchSignups(): Promise<LaunchSignup[]> {
  const snapshot = await getDb()
    .collection(COLLECTIONS.launchSignups)
    .orderBy("claimedAt", "desc")
    .limit(MAX_SIGNUPS)
    .get();

  return snapshot.docs.flatMap((doc) => {
    const code = readCode(doc);
    if (code === null) return [];

    const claimedAt = doc.data()?.claimedAt;

    return [
      {
        phone: doc.id,
        code,
        claimedAtMs: readMillis(claimedAt) ?? 0,
        redeemedAtMs: readMillis(doc.data()?.redeemedAt),
        redeemedBy: readActor(doc.data()?.redeemedBy),
      },
    ];
  });
}

/**
 * Marks a code as used, once.
 *
 * This guard is the reason the POS screen exists. The offer is one free
 * milkshake per code and nothing else in the system enforces that — the code is
 * not a secret, and until now handing one over left no trace. Reading and
 * writing inside a transaction is what makes a double-tap, or a second till,
 * lose the race rather than give away a second milkshake.
 */
export async function redeemLaunchOffer(
  phone: string,
  by: Actor,
): Promise<RedemptionResult> {
  const db = getDb();
  const ref = db.collection(COLLECTIONS.launchSignups).doc(phone);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      return { ok: false, error: "That code is not on the list." };
    }

    const already = readMillis(snapshot.data()?.redeemedAt);
    if (already !== null) {
      return {
        ok: false,
        error: `Already redeemed at ${formatIstTime(already)}.`,
      };
    }

    transaction.update(ref, {
      redeemedAt: FieldValue.serverTimestamp(),
      redeemedBy: { email: by.email, name: by.name },
    });

    return { ok: true };
  });
}

/**
 * Puts a code back to unused.
 *
 * A counter needs this: one gets tapped against the wrong customer, or the
 * milkshake never gets made. The fields are deleted rather than nulled so an
 * un-redeemed signup is indistinguishable from one that was never touched —
 * this is a hundred-code promotion, and the order itself is what the day is
 * audited on.
 */
export async function unredeemLaunchOffer(
  phone: string,
): Promise<RedemptionResult> {
  const ref = getDb().collection(COLLECTIONS.launchSignups).doc(phone);

  const snapshot = await ref.get();
  if (!snapshot.exists) {
    return { ok: false, error: "That code is not on the list." };
  }
  if (readMillis(snapshot.data()?.redeemedAt) === null) {
    return { ok: false, error: "That code has not been redeemed." };
  }

  await ref.update({
    redeemedAt: FieldValue.delete(),
    redeemedBy: FieldValue.delete(),
  });

  return { ok: true };
}
