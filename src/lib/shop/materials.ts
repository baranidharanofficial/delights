import "server-only";

import {
  FieldValue,
  Timestamp,
  type DocumentSnapshot,
  type Transaction,
} from "firebase-admin/firestore";

import { COLLECTIONS, getDb } from "@/lib/firebase/admin";

import { businessDate } from "./dates";
import { formatQuantity, isUnit, valueOf, type Unit } from "./units";
import type { Material, MaterialMovement, MovementKind } from "./types";

export type Actor = { email: string; name: string | null };

export type StockResult =
  | { ok: true; material: Material }
  | { ok: false; error: string };

/**
 * Raw material storage and the ledger that explains it.
 *
 * Every stock change goes through `applyMovement`, which writes the new balance
 * and an audit row in one transaction. Nothing adjusts `stock` directly — a
 * balance you cannot account for is a balance nobody acts on.
 */

export function readMaterial(doc: DocumentSnapshot): Material | null {
  const data = doc.data();
  if (!data) return null;

  const { name, unit } = data;
  if (typeof name !== "string" || name.trim() === "") return null;
  if (!isUnit(unit)) return null;

  const stock = data.stock;
  const stockValue = data.stockValue;

  return {
    id: doc.id,
    name,
    unit,
    stock: Number.isInteger(stock) ? stock : 0,
    stockValue: Number.isInteger(stockValue) ? stockValue : 0,
    reorderLevel: Number.isInteger(data.reorderLevel) ? data.reorderLevel : null,
    sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0,
    imageKey: typeof data.imageKey === "string" ? data.imageKey : null,
  };
}

export async function getMaterials(): Promise<Material[]> {
  const snapshot = await getDb().collection(COLLECTIONS.materials).get();
  return snapshot.docs
    .map(readMaterial)
    .filter((material): material is Material => material !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export type MaterialInput = {
  name: string;
  unit: Unit;
  reorderLevel: number | null;
  sortOrder: number;
};

export async function createMaterial(input: MaterialInput): Promise<string> {
  const doc = await getDb().collection(COLLECTIONS.materials).add({
    ...input,
    // A new material starts empty; stock only ever arrives through a receipt,
    // so there is always a ledger row behind it.
    stock: 0,
    stockValue: 0,
    createdAt: FieldValue.serverTimestamp(),
  });
  return doc.id;
}

/** Name, unit, reorder level and ordering only — never the balance. */
export async function updateMaterial(
  id: string,
  input: Partial<MaterialInput>,
): Promise<void> {
  await getDb()
    .collection(COLLECTIONS.materials)
    .doc(id)
    .update({ ...input, updatedAt: FieldValue.serverTimestamp() });
}

export async function deleteMaterial(id: string): Promise<void> {
  await getDb().collection(COLLECTIONS.materials).doc(id).delete();
}

/** Recipes referencing a material — the guard before deleting it. */
export async function countRecipesUsing(materialId: string): Promise<number> {
  const snapshot = await getDb()
    .collection(COLLECTIONS.recipes)
    .where("materialIds", "array-contains", materialId)
    .count()
    .get();
  return snapshot.data().count;
}

// --- The ledger -------------------------------------------------------------

type MovementDraft = {
  kind: MovementKind;
  /** Signed base units — positive into the store, negative out. */
  quantity: number;
  /** Signed paise, moving with the quantity. */
  value: number;
  note: string | null;
};

/**
 * Writes the balance and its audit row together.
 *
 * Runs inside the caller's transaction when given one (production consumes
 * several materials plus a menu item in a single commit) and opens its own
 * otherwise.
 */
export function writeMovement(
  transaction: Transaction,
  material: Material,
  draft: MovementDraft,
  actor: Actor,
  at: Date,
): Material {
  const db = getDb();
  const stock = material.stock + draft.quantity;
  // Rounding on the way out can leave a few paise standing against zero stock.
  // An empty bin is worth nothing, so clear the dust rather than carry it.
  const stockValue = stock === 0 ? 0 : material.stockValue + draft.value;
  const next: Material = { ...material, stock, stockValue };

  transaction.update(db.collection(COLLECTIONS.materials).doc(material.id), {
    stock,
    stockValue,
  });

  const movement = db.collection(COLLECTIONS.materialMovements).doc();
  transaction.set(movement, {
    materialId: material.id,
    materialName: material.name,
    unit: material.unit,
    kind: draft.kind,
    quantity: draft.quantity,
    value: draft.value,
    note: draft.note,
    businessDate: businessDate(at),
    at: Timestamp.fromDate(at),
    by: actor,
  });

  return next;
}

async function adjust(
  materialId: string,
  actor: Actor,
  build: (material: Material) => MovementDraft | { error: string },
): Promise<StockResult> {
  const db = getDb();
  const ref = db.collection(COLLECTIONS.materials).doc(materialId);
  const at = new Date();

  try {
    return await db.runTransaction(async (transaction) => {
      const material = readMaterial(await transaction.get(ref));
      if (!material) {
        return { ok: false as const, error: "That material no longer exists." };
      }

      const draft = build(material);
      if ("error" in draft) return { ok: false as const, error: draft.error };

      return {
        ok: true as const,
        material: writeMovement(transaction, material, draft, actor, at),
      };
    });
  } catch (cause) {
    console.error("material adjustment failed", cause);
    return { ok: false, error: "Could not save the change. Try again." };
  }
}

/** Stock in, at the price actually paid. Blends into the moving average. */
export function receiveStock(
  materialId: string,
  quantity: number,
  cost: number,
  note: string | null,
  actor: Actor,
): Promise<StockResult> {
  return adjust(materialId, actor, () => {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { error: "Received quantity must be more than zero." };
    }
    if (!Number.isInteger(cost) || cost < 0) {
      return { error: "Cost must be zero or more." };
    }
    return { kind: "receipt", quantity, value: cost, note };
  });
}

/** Stock out at what it was worth — spoilage, spillage, a burnt tray. */
export function recordWastage(
  materialId: string,
  quantity: number,
  note: string | null,
  actor: Actor,
): Promise<StockResult> {
  return adjust(materialId, actor, (material) => {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { error: "Wasted quantity must be more than zero." };
    }
    if (quantity > material.stock) {
      return {
        error: `Only ${formatQuantity(material.stock, material.unit)} in stock to write off.`,
      };
    }
    return {
      kind: "wastage",
      quantity: -quantity,
      value: -valueOf(quantity, material.stockValue, material.stock),
      note,
    };
  });
}

/**
 * Reconciles the book balance to a physical count.
 *
 * A shortfall is valued at the moving average, like any other stock leaving.
 * A surplus comes in at the same rate, which leaves the unit cost untouched —
 * the count found stock that was already paid for, not stock bought afresh.
 */
export function recordCount(
  materialId: string,
  counted: number,
  note: string | null,
  actor: Actor,
): Promise<StockResult> {
  return adjust(materialId, actor, (material) => {
    if (!Number.isInteger(counted) || counted < 0) {
      return { error: "Counted quantity must be zero or more." };
    }

    const delta = counted - material.stock;
    if (delta === 0) {
      return { error: "The count already matches the recorded stock." };
    }

    return {
      kind: "count",
      quantity: delta,
      value:
        delta < 0
          ? -valueOf(-delta, material.stockValue, material.stock)
          : valueOf(delta, material.stockValue, material.stock),
      note,
    };
  });
}

// --- Ledger reads -----------------------------------------------------------

function readMovement(doc: DocumentSnapshot): MaterialMovement | null {
  const data = doc.data();
  if (!data || !isUnit(data.unit)) return null;

  const at = data.at;
  return {
    id: doc.id,
    materialId: String(data.materialId ?? ""),
    materialName: String(data.materialName ?? ""),
    unit: data.unit,
    kind: data.kind,
    quantity: Number(data.quantity) || 0,
    value: Number(data.value) || 0,
    note: typeof data.note === "string" && data.note !== "" ? data.note : null,
    businessDate: String(data.businessDate ?? ""),
    atMs: at instanceof Timestamp ? at.toMillis() : 0,
    by: { email: String(data.by?.email ?? ""), name: data.by?.name ?? null },
  };
}

/**
 * The most recent ledger entries, newest first.
 *
 * Ordered by `at` with no filter, so it needs no composite index.
 */
export async function getRecentMovements(
  limit = 40,
): Promise<MaterialMovement[]> {
  const snapshot = await getDb()
    .collection(COLLECTIONS.materialMovements)
    .orderBy("at", "desc")
    .limit(limit)
    .get();

  return snapshot.docs
    .map(readMovement)
    .filter((movement): movement is MaterialMovement => movement !== null);
}
