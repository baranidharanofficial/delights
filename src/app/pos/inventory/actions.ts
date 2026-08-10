"use server";

import { revalidatePath } from "next/cache";

import { requirePosUser } from "@/lib/auth/session";
import {
  countRecipesUsing,
  createMaterial,
  deleteMaterial,
  getMaterials,
  receiveStock,
  recordCount,
  recordWastage,
  updateMaterial,
  type Actor,
} from "@/lib/shop/materials";
import { updateMenuItem } from "@/lib/shop/menu";
import { parseRupees } from "@/lib/shop/money";
import { isUnit, parseQuantity, type Unit } from "@/lib/shop/units";

import { EMPTY_FORM_STATE, type FormState } from "../form-state";

function refresh() {
  revalidatePath("/pos/inventory");
  // A bake's feasibility depends on these balances.
  revalidatePath("/pos/production");
}

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

async function actor(): Promise<Actor> {
  const user = await requirePosUser();
  return { email: user.email, name: user.name };
}

/**
 * Resolves the material's unit from storage rather than the form.
 *
 * The unit decides how a typed "2.5" is scaled into base units, so taking it
 * from a hidden field would let a stale tab post grams as kilograms.
 */
async function unitOf(materialId: string): Promise<Unit | null> {
  const materials = await getMaterials();
  return materials.find((material) => material.id === materialId)?.unit ?? null;
}

/**
 * Sets a menu item's finished-goods count.
 *
 * Blank means "stop counting this one", which is different from zero ("counted,
 * and none left") — an untracked item stays sellable, a zero one does not.
 *
 * This is the only place a finished balance is set by hand. Everywhere else it
 * moves on its own: sales take units out, bakes put them in, voids put them back.
 */
export async function setFinishedStock(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePosUser();

  const id = text(formData, "id");
  if (id === "") return { error: "Nothing to update." };

  const raw = text(formData, "stock");
  let stock: number | null = null;
  if (raw !== "") {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { error: "Count must be a whole number, or blank to stop counting." };
    }
    stock = parsed;
  }

  await updateMenuItem(id, { stock });

  revalidatePath("/pos/inventory");
  // The terminal greys out sold-out items, so it reads this figure too.
  revalidatePath("/pos");
  revalidatePath("/pos/production");
  return EMPTY_FORM_STATE;
}

export async function saveMaterial(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePosUser();

  const name = text(formData, "name");
  if (name === "") return { error: "Name is required." };

  const unit = text(formData, "unit");
  if (!isUnit(unit)) return { error: "Pick a unit of measure." };

  const reorderRaw = text(formData, "reorderLevel");
  const reorderEntry = text(formData, "reorderEntryUnit");
  let reorderLevel: number | null = null;
  if (reorderRaw !== "") {
    reorderLevel = parseQuantity(reorderRaw, unit, reorderEntry);
    if (reorderLevel === null) {
      return { error: "Reorder level must be a whole amount, or blank." };
    }
  }

  const sortRaw = text(formData, "sortOrder");
  const sortOrder = sortRaw === "" ? 0 : Number(sortRaw);
  if (!Number.isFinite(sortOrder)) return { error: "Sort order must be a number." };

  const id = text(formData, "id");
  if (id === "") {
    await createMaterial({ name, unit, reorderLevel, sortOrder });
  } else {
    // Unit is intentionally not editable after creation — changing it would
    // reinterpret the existing balance and every ledger row behind it.
    await updateMaterial(id, { name, reorderLevel, sortOrder });
  }

  refresh();
  return EMPTY_FORM_STATE;
}

export async function removeMaterial(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePosUser();

  const id = text(formData, "id");
  if (id === "") return { error: "Nothing to delete." };

  const inUse = await countRecipesUsing(id);
  if (inUse > 0) {
    return {
      error: `Still used by ${inUse} recipe${inUse === 1 ? "" : "s"}. Remove it from them first.`,
    };
  }

  await deleteMaterial(id);
  refresh();
  return EMPTY_FORM_STATE;
}

export async function receive(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const who = await actor();

  const id = text(formData, "id");
  const unit = await unitOf(id);
  if (!unit) return { error: "That material no longer exists." };

  const quantity = parseQuantity(
    text(formData, "quantity"),
    unit,
    text(formData, "entryUnit"),
  );
  if (quantity === null) return { error: "Enter a whole quantity to receive." };

  const cost = parseRupees(text(formData, "cost"));
  if (cost === null) return { error: "Enter what it cost, like 450 or 450.50." };

  const result = await receiveStock(
    id,
    quantity,
    cost,
    text(formData, "note") || null,
    who,
  );
  if (!result.ok) return { error: result.error };

  refresh();
  return EMPTY_FORM_STATE;
}

export async function waste(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const who = await actor();

  const id = text(formData, "id");
  const unit = await unitOf(id);
  if (!unit) return { error: "That material no longer exists." };

  const quantity = parseQuantity(
    text(formData, "quantity"),
    unit,
    text(formData, "entryUnit"),
  );
  if (quantity === null) return { error: "Enter a whole quantity to write off." };

  const reason = text(formData, "note");
  if (reason === "") return { error: "Give a reason so the write-off is explainable." };

  const result = await recordWastage(id, quantity, reason, who);
  if (!result.ok) return { error: result.error };

  refresh();
  return EMPTY_FORM_STATE;
}

export async function count(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const who = await actor();

  const id = text(formData, "id");
  const unit = await unitOf(id);
  if (!unit) return { error: "That material no longer exists." };

  const counted = parseQuantity(
    text(formData, "quantity"),
    unit,
    text(formData, "entryUnit"),
  );
  if (counted === null) return { error: "Enter the amount you actually counted." };

  const result = await recordCount(id, counted, text(formData, "note") || null, who);
  if (!result.ok) return { error: result.error };

  refresh();
  return EMPTY_FORM_STATE;
}
