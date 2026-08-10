import "server-only";

import {
  FieldValue,
  type DocumentSnapshot,
  type Firestore,
} from "firebase-admin/firestore";

import { COLLECTIONS, getDb } from "@/lib/firebase/admin";

import type { Category, MenuItem } from "./types";

/**
 * Menu and category storage.
 *
 * Documents are read defensively — the admin screen is not the only thing that
 * can write here (the Firebase console can too), so a hand-edited document with
 * a missing field must not take down the terminal. Anything unreadable is
 * skipped rather than surfaced as a half-built item you could accidentally sell.
 */

function readCategory(doc: DocumentSnapshot): Category | null {
  const data = doc.data();
  if (!data || typeof data.name !== "string" || data.name.trim() === "") {
    return null;
  }

  return {
    id: doc.id,
    name: data.name,
    sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0,
  };
}

function readMenuItem(doc: DocumentSnapshot): MenuItem | null {
  const data = doc.data();
  if (!data) return null;

  const { name, price, categoryId } = data;
  // A priced item with no valid price is the one case worth refusing outright:
  // everything downstream multiplies by it.
  if (typeof name !== "string" || name.trim() === "") return null;
  if (typeof price !== "number" || !Number.isInteger(price) || price < 0) {
    return null;
  }
  if (typeof categoryId !== "string" || categoryId === "") return null;

  return {
    id: doc.id,
    name,
    price,
    categoryId,
    available: data.available !== false,
    stock:
      typeof data.stock === "number" && Number.isInteger(data.stock)
        ? data.stock
        : null,
    sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0,
    imageKey: typeof data.imageKey === "string" ? data.imageKey : null,
  };
}

function bySortOrderThenName<T extends { sortOrder: number; name: string }>(
  a: T,
  b: T,
): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

export async function getCategories(db: Firestore = getDb()): Promise<
  Category[]
> {
  const snapshot = await db.collection(COLLECTIONS.categories).get();
  return snapshot.docs
    .map(readCategory)
    .filter((category): category is Category => category !== null)
    .sort(bySortOrderThenName);
}

export async function getMenuItems(db: Firestore = getDb()): Promise<
  MenuItem[]
> {
  const snapshot = await db.collection(COLLECTIONS.menuItems).get();
  return snapshot.docs
    .map(readMenuItem)
    .filter((item): item is MenuItem => item !== null)
    .sort(bySortOrderThenName);
}

/**
 * Both halves of the menu in one round trip pair. The terminal always needs
 * both, and issuing them together halves the latency the cashier waits through.
 */
export async function getMenu(): Promise<{
  categories: Category[];
  items: MenuItem[];
}> {
  const db = getDb();
  const [categories, items] = await Promise.all([
    getCategories(db),
    getMenuItems(db),
  ]);
  return { categories, items };
}

// --- Writes -----------------------------------------------------------------
// Callers are Server Actions that have already run `requirePosUser()`.

export type MenuItemInput = {
  name: string;
  price: number;
  categoryId: string;
  available: boolean;
  stock: number | null;
  sortOrder: number;
};

export async function createMenuItem(input: MenuItemInput): Promise<string> {
  const doc = await getDb()
    .collection(COLLECTIONS.menuItems)
    .add({ ...input, createdAt: FieldValue.serverTimestamp() });
  return doc.id;
}

export async function updateMenuItem(
  id: string,
  input: Partial<MenuItemInput>,
): Promise<void> {
  await getDb()
    .collection(COLLECTIONS.menuItems)
    .doc(id)
    .update({ ...input, updatedAt: FieldValue.serverTimestamp() });
}

export async function deleteMenuItem(id: string): Promise<void> {
  // Safe to hard-delete: order lines snapshot the name and price, so past
  // receipts and reports do not depend on this document existing.
  await getDb().collection(COLLECTIONS.menuItems).doc(id).delete();
}

export async function createCategory(
  name: string,
  sortOrder: number,
): Promise<string> {
  const doc = await getDb()
    .collection(COLLECTIONS.categories)
    .add({ name, sortOrder, createdAt: FieldValue.serverTimestamp() });
  return doc.id;
}

export async function renameCategory(id: string, name: string): Promise<void> {
  await getDb().collection(COLLECTIONS.categories).doc(id).update({ name });
}

/** Number of menu items pointing at a category — the guard before deleting it. */
export async function countItemsInCategory(id: string): Promise<number> {
  const snapshot = await getDb()
    .collection(COLLECTIONS.menuItems)
    .where("categoryId", "==", id)
    .count()
    .get();
  return snapshot.data().count;
}

export async function deleteCategory(id: string): Promise<void> {
  await getDb().collection(COLLECTIONS.categories).doc(id).delete();
}
