import "server-only";

import { Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";

import { COLLECTIONS, getDb } from "@/lib/firebase/admin";

import { businessDate } from "./dates";
import { readMaterial, writeMovement, type Actor } from "./materials";
import { readRecipe } from "./recipes";
import { formatQuantity, isUnit, valueOf } from "./units";
import type { Material, Production, ProductionLine } from "./types";

export type ProductionResult =
  | { ok: true; production: Production }
  | { ok: false; error: string };

/**
 * Base units of one material consumed to make `quantity` finished units.
 *
 * Recipes are written per batch, so producing a part-batch scales the line
 * proportionally — 20 slices from a recipe yielding 8 takes 2.5× everything.
 */
export function consumptionFor(
  perBatch: number,
  quantity: number,
  batchYield: number,
): number {
  return Math.round((perBatch * quantity) / batchYield);
}

type Consumption = { material: Material; quantity: number; cost: number };

/**
 * Records a bake: materials out, finished units in.
 *
 * One transaction covers the recipe, every material balance, the menu item's
 * finished stock and the ledger rows. A half-applied bake would leave the store
 * claiming ingredients it has already used and cakes it never made.
 */
export async function recordProduction(
  menuItemId: string,
  quantity: number,
  actor: Actor,
): Promise<ProductionResult> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: "Produced quantity must be more than zero." };
  }

  const db = getDb();
  const at = new Date();
  const itemRef = db.collection(COLLECTIONS.menuItems).doc(menuItemId);
  const recipeRef = db.collection(COLLECTIONS.recipes).doc(menuItemId);

  try {
    return await db.runTransaction(async (transaction) => {
      // Reads first, and the recipe before the materials it names. Firestore
      // allows sequential reads inside a transaction, but never a read after a
      // write — which is why nothing below writes until every balance is known.
      const [itemSnapshot, recipeSnapshot] = await transaction.getAll(
        itemRef,
        recipeRef,
      );

      const item = itemSnapshot.data();
      if (!itemSnapshot.exists || !item) {
        return { ok: false as const, error: "That menu item no longer exists." };
      }
      const itemName = typeof item.name === "string" ? item.name : menuItemId;

      const recipe = readRecipe(recipeSnapshot);
      if (!recipe) {
        return {
          ok: false as const,
          error: `${itemName} has no recipe yet. Add one before recording a bake.`,
        };
      }

      const materialSnapshots = await transaction.getAll(
        ...recipe.lines.map((line) =>
          db.collection(COLLECTIONS.materials).doc(line.materialId),
        ),
      );

      const consumptions: Consumption[] = [];
      const missing: string[] = [];
      const short: string[] = [];

      for (const [index, snapshot] of materialSnapshots.entries()) {
        const material = readMaterial(snapshot);
        if (!material) {
          missing.push(recipe.lines[index].materialId);
          continue;
        }

        const needed = consumptionFor(
          recipe.lines[index].quantity,
          quantity,
          recipe.batchYield,
        );
        // A line can round to nothing on a very small run — skip it rather than
        // write a zero movement.
        if (needed <= 0) continue;

        if (needed > material.stock) {
          short.push(
            `${material.name} (need ${formatQuantity(needed, material.unit)}, have ${formatQuantity(material.stock, material.unit)})`,
          );
          continue;
        }

        consumptions.push({
          material,
          quantity: needed,
          cost: valueOf(needed, material.stockValue, material.stock),
        });
      }

      if (missing.length > 0) {
        return {
          ok: false as const,
          error:
            "The recipe references materials that no longer exist. Edit it before baking.",
        };
      }
      if (short.length > 0) {
        return {
          ok: false as const,
          error: `Not enough stock: ${short.join("; ")}.`,
        };
      }
      if (consumptions.length === 0) {
        return { ok: false as const, error: "This bake would consume nothing." };
      }

      const lines: ProductionLine[] = consumptions.map((consumption) => ({
        materialId: consumption.material.id,
        name: consumption.material.name,
        unit: consumption.material.unit,
        quantity: consumption.quantity,
        cost: consumption.cost,
      }));

      for (const consumption of consumptions) {
        writeMovement(
          transaction,
          consumption.material,
          {
            kind: "production",
            quantity: -consumption.quantity,
            value: -consumption.cost,
            note: `${quantity} × ${itemName}`,
          },
          actor,
          at,
        );
      }

      // A null stock means the item was not being counted. A bake is exactly
      // the moment it starts being counted, so treat null as zero.
      const currentStock = Number.isInteger(item.stock) ? item.stock : 0;
      transaction.update(itemRef, { stock: currentStock + quantity });

      const productionRef = db.collection(COLLECTIONS.productions).doc();
      const production: Production = {
        id: productionRef.id,
        menuItemId,
        itemName,
        quantity,
        lines,
        totalCost: lines.reduce((sum, line) => sum + line.cost, 0),
        businessDate: businessDate(at),
        producedAtMs: at.getTime(),
        by: actor,
      };

      transaction.set(productionRef, {
        menuItemId,
        itemName,
        quantity,
        lines,
        totalCost: production.totalCost,
        businessDate: production.businessDate,
        producedAt: Timestamp.fromDate(at),
        by: actor,
      });

      return { ok: true as const, production };
    });
  } catch (cause) {
    console.error("recordProduction failed", cause);
    return {
      ok: false,
      error: "Could not record the bake. Check the connection and try again.",
    };
  }
}

function readProduction(doc: DocumentSnapshot): Production | null {
  const data = doc.data();
  if (!data) return null;

  const producedAt = data.producedAt;
  const lines = Array.isArray(data.lines) ? data.lines : [];

  return {
    id: doc.id,
    menuItemId: String(data.menuItemId ?? ""),
    itemName: String(data.itemName ?? ""),
    quantity: Number(data.quantity) || 0,
    lines: lines.filter((line: ProductionLine) => isUnit(line?.unit)),
    totalCost: Number(data.totalCost) || 0,
    businessDate: String(data.businessDate ?? ""),
    producedAtMs: producedAt instanceof Timestamp ? producedAt.toMillis() : 0,
    by: { email: String(data.by?.email ?? ""), name: data.by?.name ?? null },
  };
}

export async function getRecentProductions(limit = 25): Promise<Production[]> {
  const snapshot = await getDb()
    .collection(COLLECTIONS.productions)
    .orderBy("producedAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs
    .map(readProduction)
    .filter((production): production is Production => production !== null);
}
