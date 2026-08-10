"use server";

import { revalidatePath } from "next/cache";

import { requirePosUser } from "@/lib/auth/session";
import { clearImage, setImage, type ImageResult } from "@/lib/shop/images";

import { isImageTarget } from "./form-state";

function refresh() {
  // A picture can show up on any of these, so none of them may keep a stale copy.
  revalidatePath("/pos");
  revalidatePath("/pos/menu");
  revalidatePath("/pos/inventory");
  revalidatePath("/pos/production");
}

export async function saveImage(formData: FormData): Promise<ImageResult> {
  await requirePosUser();

  const target = formData.get("target");
  const id = formData.get("id");
  const file = formData.get("file");

  if (!isImageTarget(target)) return { ok: false, error: "Unknown target." };
  if (typeof id !== "string" || id === "") {
    return { ok: false, error: "Save the record before adding a picture." };
  }
  if (!(file instanceof File)) return { ok: false, error: "No image received." };

  const result = await setImage(target, id, file);
  if (result.ok) refresh();
  return result;
}

export async function dropImage(formData: FormData): Promise<ImageResult> {
  await requirePosUser();

  const target = formData.get("target");
  const id = formData.get("id");

  if (!isImageTarget(target)) return { ok: false, error: "Unknown target." };
  if (typeof id !== "string" || id === "") {
    return { ok: false, error: "Nothing to remove." };
  }

  const result = await clearImage(target, id);
  if (result.ok) refresh();
  return result;
}
