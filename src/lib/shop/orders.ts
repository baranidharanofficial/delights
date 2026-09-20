import "server-only";

import {
  FieldValue,
  Timestamp,
  type DocumentSnapshot,
  type DocumentReference,
} from "firebase-admin/firestore";

import { COLLECTIONS, getDb } from "@/lib/firebase/admin";

import { businessDate, isBusinessDate } from "./dates";
import { checkCoupon, normalizePhone } from "./launch-signups";
import { formatMoney, TAX_LABEL, TAX_RATE, taxOn } from "./money";
import {
  emptyKitchen,
  isPaymentMethod,
  type KitchenStamp,
  type KitchenState,
  type Order,
  type OrderLine,
  type OrderRequestLine,
  type PaymentMethod,
  type VoidRecord,
} from "./types";

export type PlaceOrderResult =
  | { ok: true; order: Order }
  | { ok: false; error: string };

type Cashier = { email: string; name: string | null };

/** `7` → `"0007"`. Rolls past four digits rather than truncating. */
function formatReference(sequence: number): string {
  return String(sequence).padStart(4, "0");
}

/**
 * Collapses the request into one entry per item.
 *
 * The terminal already sends distinct ids, but a repeated id would otherwise
 * become two `getAll` reads of the same document and two independent stock
 * checks — each passing on its own while together exceeding what is on hand.
 */
function aggregate(lines: OrderRequestLine[]): Map<string, number> {
  const totals = new Map<string, number>();

  for (const { itemId, quantity } of lines) {
    if (typeof itemId !== "string" || itemId === "") continue;
    if (!Number.isInteger(quantity) || quantity <= 0) continue;
    totals.set(itemId, (totals.get(itemId) ?? 0) + quantity);
  }

  return totals;
}

/**
 * Records a sale.
 *
 * Prices are read from Firestore inside the transaction and the totals are
 * recomputed here — the client sends item ids and quantities only. A Server
 * Action is reachable by direct POST, so a total that arrived from the browser
 * is a number the customer chose.
 *
 * The receipt number, the stock decrements and the order document all land in
 * one transaction, so a sale is either fully recorded or not recorded at all.
 *
 * `targetDate` lets the terminal ring a sale in against an earlier business
 * date — a till missed at close, entered the next morning. It only ever moves
 * backward: `placedAt` stays the real clock time the sale was actually keyed
 * in, so the audit trail (and the receipt sequence, scoped per business date)
 * stays honest about when the record was made even as `businessDate` says
 * which day's books it counts against.
 *
 * `couponPhone`, if given, is a launch-offer number the cashier typed in. It is
 * read and redeemed inside the same transaction as the sale: the discount and
 * the coupon being spent are one fact, not two separate writes that could land
 * on either side of a crash and leave the coupon marked used with no order to
 * show for it, or spent twice against two different sales.
 */
export async function placeOrder(
  requestLines: OrderRequestLine[],
  method: PaymentMethod,
  cashier: Cashier,
  targetDate?: string,
  couponPhone?: string,
): Promise<PlaceOrderResult> {
  if (!isPaymentMethod(method)) {
    return { ok: false, error: "Unrecognised payment method." };
  }

  const wanted = aggregate(requestLines);
  if (wanted.size === 0) {
    return { ok: false, error: "The order is empty." };
  }

  const db = getDb();
  const placedAt = new Date();
  const today = businessDate(placedAt);

  let date = today;
  if (targetDate !== undefined) {
    // A Server Action is reachable by direct POST, so the date needs the same
    // distrust as the total — a future date would let a sale count against
    // takings that have not happened yet.
    if (!isBusinessDate(targetDate) || targetDate > today) {
      return { ok: false, error: "That is not a valid business date." };
    }
    date = targetDate;
  }

  // Normalised the same way the claim form does, so "98765 43210" and
  // "+91 98765 43210" find the same signup — trusted no further than that,
  // since a Server Action takes this straight off whatever the browser sent.
  let couponRef: DocumentReference | null = null;
  if (couponPhone !== undefined && couponPhone.trim() !== "") {
    const normalized = normalizePhone(couponPhone);
    if (normalized === null) {
      return { ok: false, error: "That is not a valid mobile number for a coupon." };
    }
    couponRef = db.collection(COLLECTIONS.launchSignups).doc(normalized);
  }

  const orderRef = db.collection(COLLECTIONS.orders).doc();
  const counterRef = db.collection(COLLECTIONS.counters).doc(date);
  const itemRefs: DocumentReference[] = [...wanted.keys()].map((id) =>
    db.collection(COLLECTIONS.menuItems).doc(id),
  );

  try {
    return await db.runTransaction(async (transaction) => {
      // Firestore requires every read before the first write.
      const [counterSnapshot, ...rest] = await transaction.getAll(
        counterRef,
        ...itemRefs,
        ...(couponRef ? [couponRef] : []),
      );
      const itemSnapshots = couponRef ? rest.slice(0, -1) : rest;
      const couponSnapshot = couponRef ? rest[rest.length - 1] : null;

      const lines: OrderLine[] = [];
      const stockWrites: { ref: DocumentReference; stock: number }[] = [];
      const missing: string[] = [];
      const unavailable: string[] = [];
      const short: string[] = [];

      for (const snapshot of itemSnapshots as DocumentSnapshot[]) {
        const quantity = wanted.get(snapshot.id) ?? 0;
        const data = snapshot.data();

        if (!snapshot.exists || !data) {
          missing.push(snapshot.id);
          continue;
        }

        const name = typeof data.name === "string" ? data.name : snapshot.id;
        const price = data.price;

        if (typeof price !== "number" || !Number.isInteger(price) || price < 0) {
          missing.push(name);
          continue;
        }

        if (data.available === false) {
          unavailable.push(name);
          continue;
        }

        const tracked =
          typeof data.stock === "number" && Number.isInteger(data.stock);
        if (tracked && data.stock < quantity) {
          short.push(`${name} (${data.stock} left)`);
          continue;
        }
        if (tracked) {
          stockWrites.push({ ref: snapshot.ref, stock: data.stock - quantity });
        }

        lines.push({
          itemId: snapshot.id,
          name,
          unitPrice: price,
          quantity,
          lineTotal: price * quantity,
        });
      }

      if (missing.length > 0) {
        return {
          ok: false as const,
          error: `No longer on the menu: ${missing.join(", ")}. Remove and retry.`,
        };
      }
      if (unavailable.length > 0) {
        return {
          ok: false as const,
          error: `Marked unavailable: ${unavailable.join(", ")}.`,
        };
      }
      if (short.length > 0) {
        return { ok: false as const, error: `Not enough stock: ${short.join(", ")}.` };
      }

      const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);

      // Checked after the items but before anything is written: a coupon that
      // fails leaves the whole sale unrung rather than going through undiscounted.
      let discount: { amount: number; couponPhone: string } | null = null;
      if (couponRef !== null && couponSnapshot !== null) {
        const check = checkCoupon(couponSnapshot);
        if (!check.ok) {
          return { ok: false as const, error: check.error };
        }
        if (subtotal < check.minOrder) {
          return {
            ok: false as const,
            error: `That coupon needs an order of at least ${formatMoney(check.minOrder)}.`,
          };
        }
        discount = { amount: check.discountAmount, couponPhone: couponRef.id };
      }

      const tax = taxOn(subtotal);
      const total = Math.max(0, subtotal + tax - (discount?.amount ?? 0));

      // Anything other than a whole number here — a missing doc on the day's
      // first sale, or a hand-edit in the console — restarts the day at 1
      // rather than propagating NaN into the receipt number.
      const previous = counterSnapshot.data()?.seq;
      const sequence =
        (Number.isInteger(previous) ? (previous as number) : 0) + 1;
      const reference = formatReference(sequence);

      const order: Order = {
        id: orderRef.id,
        reference,
        businessDate: date,
        placedAtMs: placedAt.getTime(),
        // `getAll` resolves in the order the refs were passed, which is the
        // order the cashier tapped the items in. The ticket reads the same way.
        lines,
        subtotal,
        tax,
        taxRate: TAX_RATE,
        taxLabel: TAX_LABEL,
        discount,
        total,
        method,
        cashier,
        voided: null,
        kitchen: emptyKitchen(),
      };

      transaction.set(counterRef, { seq: sequence }, { merge: true });
      for (const { ref, stock } of stockWrites) {
        transaction.update(ref, { stock });
      }
      if (couponRef !== null && discount !== null) {
        transaction.update(couponRef, {
          redeemedAt: FieldValue.serverTimestamp(),
          redeemedBy: cashier,
        });
      }
      transaction.set(orderRef, {
        reference,
        businessDate: date,
        placedAt: Timestamp.fromDate(placedAt),
        lines,
        subtotal,
        tax,
        taxRate: TAX_RATE,
        taxLabel: TAX_LABEL,
        discount,
        total,
        method,
        cashier,
        // Written explicitly rather than left absent so the field is there to
        // filter on if voids ever need a query of their own.
        voided: null,
        // The kitchen screen ticks items off inside this block, which is why it
        // is a sibling of `lines` rather than part of them.
        kitchen: { lines: {}, completed: null },
      });

      return { ok: true as const, order };
    });
  } catch (cause) {
    // Contention retries are exhausted, the network is down, or credentials are
    // wrong. The cashier needs to know the sale did not save, not a stack trace.
    console.error("placeOrder failed", cause);
    return {
      ok: false,
      error: "Could not save the order. Check the connection and try again.",
    };
  }
}

function readVoid(data: FirebaseFirestore.DocumentData): VoidRecord | null {
  const voided = data.voided;
  if (!voided || typeof voided !== "object") return null;

  const at = voided.at;
  return {
    atMs: at instanceof Timestamp ? at.toMillis() : 0,
    by: { email: String(voided.by?.email ?? ""), name: voided.by?.name ?? null },
    reason: typeof voided.reason === "string" ? voided.reason : "",
    stockRestored: voided.stockRestored === true,
  };
}

function readStamp(value: unknown): KitchenStamp | null {
  if (!value || typeof value !== "object") return null;

  const { at, by } = value as { at?: unknown; by?: Record<string, unknown> };
  return {
    atMs: at instanceof Timestamp ? at.toMillis() : 0,
    by: {
      email: String(by?.email ?? ""),
      name: typeof by?.name === "string" ? by.name : null,
    },
  };
}

/**
 * Orders written before the kitchen screen existed carry no `kitchen` field at
 * all, and read back as a ticket nobody has touched — which is exactly what
 * they are. No backfill needed.
 */
function readKitchen(data: FirebaseFirestore.DocumentData): KitchenState {
  const kitchen = data.kitchen;
  if (!kitchen || typeof kitchen !== "object") return emptyKitchen();

  const lines: Record<string, KitchenStamp> = {};
  if (kitchen.lines && typeof kitchen.lines === "object") {
    for (const [itemId, value] of Object.entries(kitchen.lines)) {
      const stamp = readStamp(value);
      if (stamp) lines[itemId] = stamp;
    }
  }

  return { lines, completed: readStamp(kitchen.completed) };
}

function readDiscount(
  data: FirebaseFirestore.DocumentData,
): { amount: number; couponPhone: string } | null {
  const discount = data.discount;
  if (!discount || typeof discount !== "object") return null;

  const amount = discount.amount;
  const couponPhone = discount.couponPhone;
  if (typeof amount !== "number" || typeof couponPhone !== "string") return null;

  return { amount, couponPhone };
}

function readOrder(doc: DocumentSnapshot): Order | null {
  const data = doc.data();
  if (!data) return null;

  const placedAt = data.placedAt;
  const lines = Array.isArray(data.lines) ? (data.lines as OrderLine[]) : [];
  if (lines.length === 0) return null;

  return {
    id: doc.id,
    reference: typeof data.reference === "string" ? data.reference : doc.id,
    businessDate: typeof data.businessDate === "string" ? data.businessDate : "",
    placedAtMs:
      placedAt instanceof Timestamp ? placedAt.toMillis() : Number(placedAt) || 0,
    lines,
    subtotal: Number(data.subtotal) || 0,
    tax: Number(data.tax) || 0,
    taxRate: typeof data.taxRate === "number" ? data.taxRate : TAX_RATE,
    taxLabel: typeof data.taxLabel === "string" ? data.taxLabel : TAX_LABEL,
    discount: readDiscount(data),
    total: Number(data.total) || 0,
    method: isPaymentMethod(data.method) ? data.method : "Cash",
    cashier: {
      email: String(data.cashier?.email ?? ""),
      name: data.cashier?.name ?? null,
    },
    voided: readVoid(data),
    kitchen: readKitchen(data),
  };
}

export type VoidResult =
  | { ok: true; order: Order }
  | { ok: false; error: string };

/**
 * Cancels a sale.
 *
 * The order document is kept and flagged rather than deleted, and the day's
 * receipt sequence is left alone — reissuing #0007 would make two different
 * sales share a number, and the gap is the point.
 *
 * `restoreStock` covers the two different things a void means: a misring, where
 * the cake is still on the shelf, and a refund, where the customer kept it.
 */
export async function voidOrder(
  orderId: string,
  reason: string,
  restoreStock: boolean,
  actor: { email: string; name: string | null },
): Promise<VoidResult> {
  const trimmed = reason.trim();
  if (trimmed === "") {
    return { ok: false, error: "Give a reason so the void is explainable." };
  }

  const db = getDb();
  const at = new Date();
  const orderRef = db.collection(COLLECTIONS.orders).doc(orderId);

  try {
    return await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(orderRef);
      const order = readOrder(snapshot);
      if (!order) {
        return { ok: false as const, error: "That order no longer exists." };
      }
      if (order.voided) {
        return { ok: false as const, error: "That order is already voided." };
      }

      let restored = false;
      if (restoreStock) {
        const itemRefs = order.lines.map((line) =>
          db.collection(COLLECTIONS.menuItems).doc(line.itemId),
        );
        const itemSnapshots = await transaction.getAll(...itemRefs);

        for (const [index, itemSnapshot] of itemSnapshots.entries()) {
          const current = itemSnapshot.data()?.stock;
          // Only put units back where the item still exists and is counted.
          // Adding to an untracked item would invent a balance from nothing.
          if (!itemSnapshot.exists || !Number.isInteger(current)) continue;

          transaction.update(itemSnapshot.ref, {
            stock: current + order.lines[index].quantity,
          });
          restored = true;
        }
      }

      const record = {
        at: Timestamp.fromDate(at),
        by: actor,
        reason: trimmed,
        stockRestored: restored,
      };
      transaction.update(orderRef, { voided: record });

      return {
        ok: true as const,
        order: {
          ...order,
          voided: {
            atMs: at.getTime(),
            by: actor,
            reason: trimmed,
            stockRestored: restored,
          },
        },
      };
    });
  } catch (cause) {
    console.error("voidOrder failed", cause);
    return {
      ok: false,
      error: "Could not void the order. Check the connection and try again.",
    };
  }
}

/**
 * Permanently removes an order document.
 *
 * Unlike a void, this leaves no trace and the receipt number can never be
 * accounted for. Use only to clean up test orders or data entry mistakes before
 * the day is reconciled. Stock is not automatically restored — the caller is
 * responsible for any inventory adjustment needed.
 */
export async function deleteOrder(orderId: string): Promise<void> {
  await getDb().collection(COLLECTIONS.orders).doc(orderId).delete();
}

/**
 * Every order for one business date, newest first.
 *
 * Sorted in memory rather than with `orderBy`: pairing an equality filter with a
 * sort on a different field needs a composite index, and one counter's daily
 * volume does not justify a deploy step for it.
 */
export async function getOrdersForDate(date: string): Promise<Order[]> {
  const snapshot = await getDb()
    .collection(COLLECTIONS.orders)
    .where("businessDate", "==", date)
    .get();

  return snapshot.docs
    .map(readOrder)
    .filter((order): order is Order => order !== null)
    .sort((a, b) => b.placedAtMs - a.placedAtMs);
}
