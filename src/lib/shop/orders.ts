import "server-only";

import {
  Timestamp,
  type DocumentSnapshot,
  type DocumentReference,
} from "firebase-admin/firestore";

import { COLLECTIONS, getDb } from "@/lib/firebase/admin";

import { businessDate } from "./dates";
import { TAX_LABEL, TAX_RATE, taxOn } from "./money";
import {
  isPaymentMethod,
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
 */
export async function placeOrder(
  requestLines: OrderRequestLine[],
  method: PaymentMethod,
  cashier: Cashier,
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
  const date = businessDate(placedAt);

  const orderRef = db.collection(COLLECTIONS.orders).doc();
  const counterRef = db.collection(COLLECTIONS.counters).doc(date);
  const itemRefs: DocumentReference[] = [...wanted.keys()].map((id) =>
    db.collection(COLLECTIONS.menuItems).doc(id),
  );

  try {
    return await db.runTransaction(async (transaction) => {
      // Firestore requires every read before the first write.
      const [counterSnapshot, ...itemSnapshots] = await transaction.getAll(
        counterRef,
        ...itemRefs,
      );

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
      const tax = taxOn(subtotal);
      const total = subtotal + tax;

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
        total,
        method,
        cashier,
        voided: null,
      };

      transaction.set(counterRef, { seq: sequence }, { merge: true });
      for (const { ref, stock } of stockWrites) {
        transaction.update(ref, { stock });
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
        total,
        method,
        cashier,
        // Written explicitly rather than left absent so the field is there to
        // filter on if voids ever need a query of their own.
        voided: null,
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
    total: Number(data.total) || 0,
    method: isPaymentMethod(data.method) ? data.method : "Cash",
    cashier: {
      email: String(data.cashier?.email ?? ""),
      name: data.cashier?.name ?? null,
    },
    voided: readVoid(data),
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
