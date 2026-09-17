"use server";

import { revalidatePath } from "next/cache";

import { requireSection } from "@/lib/auth/session";
import { createQrCode, deleteQrCode } from "@/lib/shop/qr-codes";

import { EMPTY_FORM_STATE, type FormState } from "../form-state";

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

export async function addQrCode(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireSection("/pos/qr");

  const result = await createQrCode(
    { label: text(formData, "label"), targetUrl: text(formData, "targetUrl") },
    { email: user.email, name: user.name },
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/pos/qr");
  return EMPTY_FORM_STATE;
}

export async function removeQrCode(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSection("/pos/qr");

  const id = text(formData, "id");
  if (id === "") return { error: "Nothing to delete." };

  await deleteQrCode(id);
  revalidatePath("/pos/qr");
  return EMPTY_FORM_STATE;
}
