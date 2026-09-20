import "server-only";

import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";

import { COLLECTIONS, getDb } from "@/lib/firebase/admin";

import { formatIstTime } from "./dates";
import {
  FLAT_DISCOUNT_AMOUNT,
  FLAT_DISCOUNT_MIN_ORDER,
  FLAT_DISCOUNT_SIGNUPS,
  LAUNCH_DISCOUNT_PERCENT,
  MAX_SIGNUPS,
  TOTAL_SIGNUPS,
  type OfferDetails,
  type OfferTier,
} from "./launch-offer";

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
  | { ok: true; code: string; phone: string; returning: boolean; offer: OfferDetails }
  | { ok: false; error: string };

function readCode(snapshot: DocumentSnapshot): string | null {
  const code = snapshot.data()?.code;
  return typeof code === "string" && code !== "" ? code : null;
}

/** Epoch milliseconds, or `null` for a field that is absent or still pending. */
function readMillis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

/**
 * The offer a signup was stamped with, read back off its document.
 *
 * `tier` postdates `discountPercent` — every signup claimed before this tier
 * existed has the field but not the tag, and reads back as `"milkshake"`
 * because that was the only offer there was to give it.
 */
function readOffer(snapshot: DocumentSnapshot): OfferDetails | null {
  const data = snapshot.data();
  if (!data) return null;

  if (data.tier === "flat_discount") {
    return {
      tier: "flat_discount",
      discountAmount:
        typeof data.discountAmount === "number"
          ? data.discountAmount
          : FLAT_DISCOUNT_AMOUNT,
      minOrder:
        typeof data.minOrder === "number" ? data.minOrder : FLAT_DISCOUNT_MIN_ORDER,
    };
  }

  return {
    tier: "milkshake",
    discountPercent:
      typeof data.discountPercent === "number"
        ? data.discountPercent
        : LAUNCH_DISCOUNT_PERCENT,
  };
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
 * A returning signup keeps whatever tier it was originally given, even if a
 * recount today would put that position on the other side of the boundary.
 *
 * The capacity count sits outside the transaction on purpose. A count read
 * inside one takes a lock on every document it matched — the whole collection,
 * here — which would put every simultaneous signup into a queue behind every
 * other. Outside, it is a stale number, so claims arriving together right at
 * a tier's boundary can settle a few past it — a handful of milkshakes handed
 * out as the coupon tier opens, or a handful of coupons handed out after the
 * list is meant to be full.
 *
 * That is the accepted trade rather than an oversight. An exact cap wants a
 * single counter document incremented inside the transaction, which locks one
 * document instead of the collection; worth adding the day the overshoot costs
 * more than the handful of mispriced offers it stands for.
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
  const tier: OfferTier | null =
    total < MAX_SIGNUPS
      ? "milkshake"
      : total < TOTAL_SIGNUPS
        ? "flat_discount"
        : null;

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);

    const existing = readCode(snapshot);
    if (existing !== null) {
      const offer = readOffer(snapshot) ?? {
        tier: "milkshake" as const,
        discountPercent: LAUNCH_DISCOUNT_PERCENT,
      };
      return { ok: true, code: existing, phone, returning: true, offer };
    }

    if (tier === null) {
      return {
        ok: false,
        error: `All ${TOTAL_SIGNUPS} launch offers are taken. Come by on the day anyway — we'll be making plenty.`,
      };
    }

    const code = generateCode();
    const offer: OfferDetails =
      tier === "milkshake"
        ? { tier, discountPercent: LAUNCH_DISCOUNT_PERCENT }
        : { tier, discountAmount: FLAT_DISCOUNT_AMOUNT, minOrder: FLAT_DISCOUNT_MIN_ORDER };

    transaction.set(ref, {
      phone,
      code,
      claimedAt: FieldValue.serverTimestamp(),
      tier,
      ...(offer.tier === "milkshake"
        ? { discountPercent: offer.discountPercent }
        : { discountAmount: offer.discountAmount, minOrder: offer.minOrder }),
    });

    return { ok: true, code, phone, returning: false, offer };
  });
}

export type LaunchAvailability = {
  milkshakesClaimed: number;
  milkshakesRemaining: number;
  milkshakeTierFull: boolean;
  couponsClaimed: number;
  couponsRemaining: number;
  soldOut: boolean;
};

/**
 * How much of each tier is left, for the public page.
 *
 * The page uses this to keep the coupon tier unmentioned until the milkshake
 * tier is actually full, and to count the milkshakes remaining down as they're
 * claimed — both of which need a real number, not the fixed constants the page
 * used to print. One `.count()` aggregation, the same read `claimLaunchOffer`
 * already does outside its transaction, so it costs nothing new per claim and
 * is cheap enough for a page that revalidates every few seconds rather than
 * reading Firestore on every single visit.
 */
export async function getLaunchAvailability(): Promise<LaunchAvailability> {
  const total = (
    await getDb().collection(COLLECTIONS.launchSignups).count().get()
  ).data().count;

  const milkshakesClaimed = Math.min(total, MAX_SIGNUPS);
  const milkshakeTierFull = total >= MAX_SIGNUPS;
  const couponsClaimed = Math.min(
    Math.max(0, total - MAX_SIGNUPS),
    FLAT_DISCOUNT_SIGNUPS,
  );

  return {
    milkshakesClaimed,
    milkshakesRemaining: MAX_SIGNUPS - milkshakesClaimed,
    milkshakeTierFull,
    couponsClaimed,
    couponsRemaining: FLAT_DISCOUNT_SIGNUPS - couponsClaimed,
    soldOut: total >= TOTAL_SIGNUPS,
  };
}

/** Whoever was signed in at the till when a code was handed over. */
export type Actor = { email: string; name: string | null };

export type LaunchSignup = {
  phone: string;
  code: string;
  claimedAtMs: number;
  offer: OfferDetails;
  /** `null` until the offer is actually handed over. */
  redeemedAtMs: number | null;
  redeemedBy: Actor | null;
};

export type RedemptionResult = { ok: true } | { ok: false; error: string };

/**
 * Every signup, newest first — for whoever works the counter on the day.
 *
 * Nothing on the public site reads this; it backs `/pos/launch`. The whole list
 * comes back in one read rather than being searched in Firestore, because
 * `TOTAL_SIGNUPS` bounds it at two hundred rows: cheaper than a query, no
 * index to keep, and it lets the screen filter as the cashier types instead of
 * once per keystroke over the network.
 */
export async function getLaunchSignups(): Promise<LaunchSignup[]> {
  const snapshot = await getDb()
    .collection(COLLECTIONS.launchSignups)
    .orderBy("claimedAt", "desc")
    .limit(TOTAL_SIGNUPS)
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
        offer: readOffer(doc) ?? {
          tier: "milkshake" as const,
          discountPercent: LAUNCH_DISCOUNT_PERCENT,
        },
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

export type CouponCheck =
  | { ok: true; discountAmount: number; minOrder: number }
  | { ok: false; error: string };

/**
 * Whether a phone number typed in at checkout is really an unspent coupon.
 *
 * Exported as a pure check on an already-read snapshot, not a function that
 * opens its own transaction, because `placeOrder` has to redeem the coupon in
 * the very same transaction as the sale it discounts — done separately, a
 * doubled tap or a second till could ring the discount against two different
 * orders before either write lands.
 */
export function checkCoupon(snapshot: DocumentSnapshot): CouponCheck {
  if (!snapshot.exists) {
    return { ok: false, error: "That number has no launch coupon on file." };
  }

  const offer = readOffer(snapshot);
  if (offer === null || offer.tier !== "flat_discount") {
    return {
      ok: false,
      error:
        "That number's launch offer is a free milkshake, not a coupon — redeem it from the launch codes screen instead.",
    };
  }

  if (readMillis(snapshot.data()?.redeemedAt) !== null) {
    return { ok: false, error: "That coupon has already been used." };
  }

  return { ok: true, discountAmount: offer.discountAmount, minOrder: offer.minOrder };
}

/**
 * Puts a code back to unused.
 *
 * A counter needs this: one gets tapped against the wrong customer, or the
 * milkshake never gets made, or a coupon was applied to an order that was then
 * voided. The fields are deleted rather than nulled so an un-redeemed signup is
 * indistinguishable from one that was never touched — this is a two-hundred-code
 * promotion, and the order itself is what the day is audited on.
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
