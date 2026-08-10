import "server-only";

import { COLLECTIONS, getDb } from "@/lib/firebase/admin";
import { deleteImage, uploadImage } from "@/lib/firebase/storage";

export type ImageResult = { ok: true } | { ok: false; error: string };

type Target = "menuItems" | "materials";

const FOLDERS = {
  menuItems: "menu",
  materials: "materials",
} as const;

/**
 * Attaches an image to a menu item or a material.
 *
 * The document is repointed first and the old object deleted afterwards. Doing
 * it the other way round would leave a window where the record names a file that
 * is already gone.
 */
export async function setImage(
  target: Target,
  id: string,
  file: File,
): Promise<ImageResult> {
  const ref = getDb().collection(COLLECTIONS[target]).doc(id);

  const snapshot = await ref.get();
  if (!snapshot.exists) return { ok: false, error: "That record no longer exists." };

  const uploaded = await uploadImage(FOLDERS[target], id, file);
  if (!uploaded.ok) return { ok: false, error: uploaded.error };

  const previous = snapshot.data()?.imageKey;
  await ref.update({ imageKey: uploaded.key });

  if (typeof previous === "string" && previous !== "") {
    await deleteImage(previous);
  }

  return { ok: true };
}

export async function clearImage(
  target: Target,
  id: string,
): Promise<ImageResult> {
  const ref = getDb().collection(COLLECTIONS[target]).doc(id);

  const snapshot = await ref.get();
  if (!snapshot.exists) return { ok: false, error: "That record no longer exists." };

  const previous = snapshot.data()?.imageKey;
  await ref.update({ imageKey: null });

  if (typeof previous === "string" && previous !== "") {
    await deleteImage(previous);
  }

  return { ok: true };
}
