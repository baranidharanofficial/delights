import "server-only";

import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";

import { COLLECTIONS, getDb } from "@/lib/firebase/admin";

import type { OrderLine } from "./types";

export type Actor = { email: string; name: string | null };

export type KitchenResult = { ok: true } | { ok: false; error: string };

/**
 * Marking work off is a write to `kitchen` and nothing else.
 *
 * Every function here updates a single nested field rather than setting the
 * `kitchen` map wholesale. Two cooks ticking two different items on the same
 * ticket at the same moment is the ordinary case on a busy pass, and a
 * whole-map write would let the second one erase the first.
 */
function stamp(actor: Actor, at: Date) {
  return { at: Timestamp.fromDate(at), by: actor };
}

/** The document, checked for the things that make a tick meaningless. */
async function readTicket(
  transaction: FirebaseFirestore.Transaction,
  ref: FirebaseFirestore.DocumentReference,
): Promise<{ lines: OrderLine[]; completed: boolean } | { error: string }> {
  const snapshot = await transaction.get(ref);
  const data = snapshot.data();

  if (!snapshot.exists || !data) return { error: "That order no longer exists." };
  if (data.voided) {
    return { error: "That order was voided — nothing to make." };
  }

  return {
    lines: Array.isArray(data.lines) ? (data.lines as OrderLine[]) : [],
    completed: Boolean(data.kitchen?.completed),
  };
}

/**
 * Ticks one item on a ticket off, or puts it back.
 *
 * Undoing deletes the stamp rather than writing a `done: false` beside it, so
 * "not made" has exactly one representation — the same one a ticket nobody has
 * touched yet already has.
 */
export async function markLine(
  orderId: string,
  itemId: string,
  done: boolean,
  actor: Actor,
): Promise<KitchenResult> {
  if (orderId === "" || itemId === "") {
    return { ok: false, error: "Nothing to mark." };
  }

  const db = getDb();
  const ref = db.collection(COLLECTIONS.orders).doc(orderId);
  const at = new Date();

  try {
    return await db.runTransaction(async (transaction) => {
      const ticket = await readTicket(transaction, ref);
      if ("error" in ticket) return { ok: false as const, error: ticket.error };

      if (ticket.completed) {
        return {
          ok: false as const,
          error: "That ticket has already gone out. Reopen it to change items.",
        };
      }
      if (!ticket.lines.some((line) => line.itemId === itemId)) {
        return { ok: false as const, error: "That item is not on this ticket." };
      }

      transaction.update(
        ref,
        // A path rather than a dotted string: an item id is a Firestore
        // document id, and a dotted key would misread one containing a dot.
        new FieldPath("kitchen", "lines", itemId),
        done ? stamp(actor, at) : FieldValue.delete(),
      );

      return { ok: true as const };
    });
  } catch (cause) {
    console.error("markLine failed", cause);
    return {
      ok: false,
      error: "Could not save that. Check the connection and try again.",
    };
  }
}

/**
 * Calls a whole ticket away, or reopens one called away by mistake.
 *
 * Completing deliberately leaves the per-item stamps alone. The items a cook
 * actually ticked off stay the record of what they ticked off, and the screen
 * reads a served ticket as fully made regardless — see `isLineDone`. That also
 * makes reopening lossless: the ticket goes back to exactly the half-finished
 * state it was in before the tap.
 */
export async function markOrder(
  orderId: string,
  done: boolean,
  actor: Actor,
): Promise<KitchenResult> {
  if (orderId === "") return { ok: false, error: "Nothing to mark." };

  const db = getDb();
  const ref = db.collection(COLLECTIONS.orders).doc(orderId);
  const at = new Date();

  try {
    return await db.runTransaction(async (transaction) => {
      const ticket = await readTicket(transaction, ref);
      if ("error" in ticket) return { ok: false as const, error: ticket.error };

      transaction.update(
        ref,
        new FieldPath("kitchen", "completed"),
        done ? stamp(actor, at) : FieldValue.delete(),
      );

      return { ok: true as const };
    });
  } catch (cause) {
    console.error("markOrder failed", cause);
    return {
      ok: false,
      error: "Could not save that. Check the connection and try again.",
    };
  }
}
