"use server";

import { revalidatePath } from "next/cache";

import { requirePosUser } from "@/lib/auth/session";
import { getMaterials } from "@/lib/shop/materials";
import { recordProduction } from "@/lib/shop/production";
import { deleteRecipe, saveRecipe } from "@/lib/shop/recipes";
import { parseQuantity } from "@/lib/shop/units";
import type { RecipeLine } from "@/lib/shop/types";

import { EMPTY_FORM_STATE, type FormState } from "../form-state";

function refresh() {
  revalidatePath("/pos/production");
  // A bake moves material balances and the item's finished stock.
  revalidatePath("/pos/inventory");
  revalidatePath("/pos");
  revalidatePath("/pos/menu");
}

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

export async function bake(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePosUser();

  const menuItemId = text(formData, "menuItemId");
  if (menuItemId === "") return { error: "Pick what you baked." };

  const quantity = Number(text(formData, "quantity"));
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { error: "Enter how many whole units you made." };
  }

  const result = await recordProduction(menuItemId, quantity, {
    email: user.email,
    name: user.name,
  });
  if (!result.ok) return { error: result.error };

  refresh();
  return EMPTY_FORM_STATE;
}

/**
 * Saves a recipe from a variable number of ingredient rows.
 *
 * The form posts `materialId` / `lineQuantity` / `lineEntryUnit` as parallel
 * repeated fields. A row with a blank quantity is dropped, which is also how a
 * line gets removed — there is no separate delete control per row.
 */
export async function saveRecipeForm(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePosUser();

  const menuItemId = text(formData, "menuItemId");
  if (menuItemId === "") return { error: "Missing the menu item." };

  const batchYield = Number(text(formData, "batchYield"));
  if (!Number.isInteger(batchYield) || batchYield <= 0) {
    return { error: "Batch yield must be a whole number above zero." };
  }

  const materialIds = formData.getAll("materialId").map(String);
  const quantities = formData.getAll("lineQuantity").map(String);
  const entryUnits = formData.getAll("lineEntryUnit").map(String);

  const byId = new Map(
    (await getMaterials()).map((material) => [material.id, material]),
  );

  const lines = new Map<string, number>();
  for (const [index, materialId] of materialIds.entries()) {
    const raw = (quantities[index] ?? "").trim();
    if (raw === "") continue;

    const material = byId.get(materialId);
    if (!material) return { error: "Pick a material that still exists." };

    const quantity = parseQuantity(raw, material.unit, entryUnits[index] ?? "");
    if (quantity === null || quantity <= 0) {
      return { error: `Quantity for ${material.name} must be a whole amount.` };
    }

    // The same material picked on two rows is one ingredient, not two.
    lines.set(materialId, (lines.get(materialId) ?? 0) + quantity);
  }

  const recipeLines: RecipeLine[] = [...lines].map(([materialId, quantity]) => ({
    materialId,
    quantity,
  }));

  if (recipeLines.length === 0) {
    await deleteRecipe(menuItemId);
  } else {
    await saveRecipe(menuItemId, batchYield, recipeLines);
  }

  refresh();
  return EMPTY_FORM_STATE;
}
