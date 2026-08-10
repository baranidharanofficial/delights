"use server";

import { revalidatePath } from "next/cache";

import { requirePosUser } from "@/lib/auth/session";
import {
  countItemsInCategory,
  createCategory,
  createMenuItem,
  deleteCategory,
  deleteMenuItem,
  getCategories,
  renameCategory,
  updateMenuItem,
  type MenuItemInput,
} from "@/lib/shop/menu";
import { parseRupees } from "@/lib/shop/money";

import { EMPTY_FORM_STATE, type FormState } from "../form-state";

function refresh() {
  revalidatePath("/pos/menu");
  // The terminal serves the same menu, so it goes stale on every edit here.
  revalidatePath("/pos");
  // Inventory lists these items to show their counts.
  revalidatePath("/pos/inventory");
}

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

/** Everything the menu owns. Stock is deliberately absent — see `saveMenuItem`. */
type MenuFields = Omit<MenuItemInput, "stock">;

function parseItemForm(
  formData: FormData,
  knownCategoryIds: Set<string>,
): { input: MenuFields } | { error: string } {
  const name = text(formData, "name");
  if (name === "") return { error: "Name is required." };

  const price = parseRupees(text(formData, "price"));
  if (price === null) {
    return { error: `Price for “${name}” must be a number like 190 or 190.50.` };
  }

  const categoryId = text(formData, "categoryId");
  if (!knownCategoryIds.has(categoryId)) {
    return { error: "Pick a category that still exists." };
  }

  const sortOrderRaw = text(formData, "sortOrder");
  const sortOrder = sortOrderRaw === "" ? 0 : Number(sortOrderRaw);
  if (!Number.isFinite(sortOrder)) return { error: "Sort order must be a number." };

  return {
    input: {
      name,
      price,
      categoryId,
      available: formData.get("available") !== null,
      sortOrder,
    },
  };
}

export async function saveMenuItem(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePosUser();

  const categories = await getCategories();
  const parsed = parseItemForm(
    formData,
    new Set(categories.map((category) => category.id)),
  );
  if ("error" in parsed) return parsed;

  const id = text(formData, "id");
  if (id === "") {
    // New items start untracked. Counting one begins on the inventory screen,
    // which is the only place that owns a stock figure.
    await createMenuItem({ ...parsed.input, stock: null });
  } else {
    // A partial update, so the balance is left exactly as it was. Sales,
    // production and voids move it; this form must never overwrite it.
    await updateMenuItem(id, parsed.input);
  }

  refresh();
  return EMPTY_FORM_STATE;
}

export async function removeMenuItem(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePosUser();

  const id = text(formData, "id");
  if (id === "") return { error: "Nothing to delete." };

  await deleteMenuItem(id);
  refresh();
  return EMPTY_FORM_STATE;
}

export async function saveCategory(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePosUser();

  const name = text(formData, "name");
  if (name === "") return { error: "Category name is required." };

  const id = text(formData, "id");
  if (id === "") {
    const sortOrderRaw = text(formData, "sortOrder");
    await createCategory(name, sortOrderRaw === "" ? 0 : Number(sortOrderRaw) || 0);
  } else {
    await renameCategory(id, name);
  }

  refresh();
  return EMPTY_FORM_STATE;
}

export async function removeCategory(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePosUser();

  const id = text(formData, "id");
  if (id === "") return { error: "Nothing to delete." };

  // Deleting out from under its items would leave them unreachable on the
  // terminal — filtered out of every category tab, but still sellable by search.
  const inUse = await countItemsInCategory(id);
  if (inUse > 0) {
    return {
      error: `That category still has ${inUse} item${inUse === 1 ? "" : "s"}. Move or delete them first.`,
    };
  }

  await deleteCategory(id);
  refresh();
  return EMPTY_FORM_STATE;
}
