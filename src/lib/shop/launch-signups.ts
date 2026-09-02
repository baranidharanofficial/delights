import "server-only";

import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";

import { COLLECTIONS, getDb } from "@/lib/firebase/admin";

import { LAUNCH_DISCOUNT_PERCENT } from "./launch-offer";

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
 * Signups the shop will take.
 *
 * This is the one write path on the site that no login stands in front of, so
 * it needs a ceiling. Ten thousand is far past what a single shop's opening day
 * can serve — a flood beyond it is abuse, not interest, and a number already on
 * the list still gets its code back after the cap is reached.
 */
export const MAX_SIGNUPS = 10_000;

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
 * other. Outside, it is a stale number, and a stale number is fine for a
 * ceiling that exists to stop a flood rather than to be exact at the boundary.
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
        error: "The launch list is full. Come by on the day anyway — we'll be baking.",
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

export type LaunchSignup = {
  phone: string;
  code: string;
  claimedAtMs: number;
};

/**
 * Every signup, newest first — for whoever works the counter on the day.
 *
 * Nothing on the public site reads this; it is here so the list is one import
 * away when the offer needs a screen behind it, rather than something that has
 * to be dug out of the Firebase console.
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
        claimedAtMs: claimedAt instanceof Timestamp ? claimedAt.toMillis() : 0,
      },
    ];
  });
}
