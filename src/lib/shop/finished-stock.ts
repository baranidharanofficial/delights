import "server-only";

import { Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";

import { COLLECTIONS, getDb } from "@/lib/firebase/admin";

import { businessDate } from "./dates";
import type { StockAdjustment } from "./types";

export type Actor = { email: string; name: string | null };

export type AdjustmentResult =
  | { ok: true; adjustment: StockAdjustment }
  | { ok: false; error: string };

/**
 * Hand corrections to a menu item's finished count.
 *
 * The balance and its audit row are written in one transaction, so the count on
 * screen is always backed by a record of who set it. `previous` is read inside
 * the transaction rather than trusted from the form — two people correcting the
 * same item would otherwise both log the same starting figure.
 */
export async function setFinishedCount(
  itemId: string,
  next: number | null,
  note: string | null,
  actor: Actor,
): Promise<AdjustmentResult> {
  if (next !== null && (!Number.isInteger(next) || next < 0)) {
    return { ok: false, error: "Count must be a whole number, or blank." };
  }

  const db = getDb();
  const at = new Date();
  const itemRef = db.collection(COLLECTIONS.menuItems).doc(itemId);

  try {
    return await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(itemRef);
      const data = snapshot.data();
      if (!snapshot.exists || !data) {
        return { ok: false as const, error: "That item no longer exists." };
      }

      const previous = Number.isInteger(data.stock) ? (data.stock as number) : null;
      if (previous === next) {
        return {
          ok: false as const,
          error: "That is already the recorded count.",
        };
      }

      // Only a change between two counted figures is goods moving. Starting or
      // stopping a count is a bookkeeping decision, not a gain or a loss.
      const delta =
        previous !== null && next !== null ? next - previous : null;

      const itemName = typeof data.name === "string" ? data.name : itemId;
      const adjustmentRef = db.collection(COLLECTIONS.stockAdjustments).doc();

      transaction.update(itemRef, { stock: next });
      transaction.set(adjustmentRef, {
        itemId,
        itemName,
        previous,
        next,
        delta,
        note,
        businessDate: businessDate(at),
        at: Timestamp.fromDate(at),
        by: actor,
      });

      return {
        ok: true as const,
        adjustment: {
          id: adjustmentRef.id,
          itemId,
          itemName,
          previous,
          next,
          delta,
          note,
          businessDate: businessDate(at),
          atMs: at.getTime(),
          by: actor,
        },
      };
    });
  } catch (cause) {
    console.error("setFinishedCount failed", cause);
    return { ok: false, error: "Could not save the count. Try again." };
  }
}

function readAdjustment(doc: DocumentSnapshot): StockAdjustment | null {
  const data = doc.data();
  if (!data) return null;

  const at = data.at;
  return {
    id: doc.id,
    itemId: String(data.itemId ?? ""),
    itemName: String(data.itemName ?? ""),
    previous: Number.isInteger(data.previous) ? data.previous : null,
    next: Number.isInteger(data.next) ? data.next : null,
    delta: Number.isInteger(data.delta) ? data.delta : null,
    note: typeof data.note === "string" && data.note !== "" ? data.note : null,
    businessDate: String(data.businessDate ?? ""),
    atMs: at instanceof Timestamp ? at.toMillis() : 0,
    by: { email: String(data.by?.email ?? ""), name: data.by?.name ?? null },
  };
}

/** Newest first. Ordered with no filter, so it needs no composite index. */
export async function getRecentAdjustments(
  limit = 20,
): Promise<StockAdjustment[]> {
  const snapshot = await getDb()
    .collection(COLLECTIONS.stockAdjustments)
    .orderBy("at", "desc")
    .limit(limit)
    .get();

  return snapshot.docs
    .map(readAdjustment)
    .filter((adjustment): adjustment is StockAdjustment => adjustment !== null);
}
