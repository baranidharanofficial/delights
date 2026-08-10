import "server-only";

import { FieldValue, type DocumentSnapshot } from "firebase-admin/firestore";

import { COLLECTIONS, getDb } from "@/lib/firebase/admin";

import type { Recipe, RecipeLine } from "./types";

/**
 * What each menu item is made of.
 *
 * Keyed by the menu item's own id, so a recipe is a single get rather than a
 * query, and deleting the item leaves an orphan that simply never resolves.
 */

export function readRecipe(doc: DocumentSnapshot): Recipe | null {
  const data = doc.data();
  if (!data) return null;

  const batchYield = data.batchYield;
  if (!Number.isInteger(batchYield) || batchYield <= 0) return null;

  const lines = Array.isArray(data.lines) ? data.lines : [];
  const parsed: RecipeLine[] = lines.flatMap((line: unknown) => {
    if (typeof line !== "object" || line === null) return [];
    const { materialId, quantity } = line as Record<string, unknown>;
    if (typeof materialId !== "string" || materialId === "") return [];
    if (!Number.isInteger(quantity) || (quantity as number) <= 0) return [];
    return [{ materialId, quantity: quantity as number }];
  });

  if (parsed.length === 0) return null;

  return { menuItemId: doc.id, batchYield, lines: parsed };
}

export async function getRecipes(): Promise<Map<string, Recipe>> {
  const snapshot = await getDb().collection(COLLECTIONS.recipes).get();
  const recipes = new Map<string, Recipe>();

  for (const doc of snapshot.docs) {
    const recipe = readRecipe(doc);
    if (recipe) recipes.set(recipe.menuItemId, recipe);
  }

  return recipes;
}

export async function saveRecipe(
  menuItemId: string,
  batchYield: number,
  lines: RecipeLine[],
): Promise<void> {
  await getDb()
    .collection(COLLECTIONS.recipes)
    .doc(menuItemId)
    .set({
      batchYield,
      lines,
      // Denormalised purely so "is this material used anywhere?" is one
      // indexed query instead of reading every recipe.
      materialIds: lines.map((line) => line.materialId),
      updatedAt: FieldValue.serverTimestamp(),
    });
}

export async function deleteRecipe(menuItemId: string): Promise<void> {
  await getDb().collection(COLLECTIONS.recipes).doc(menuItemId).delete();
}
