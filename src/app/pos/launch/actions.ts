"use server";

import { revalidatePath } from "next/cache";

import { requirePosUser } from "@/lib/auth/session";
import {
  redeemLaunchOffer,
  unredeemLaunchOffer,
} from "@/lib/shop/launch-signups";

import { EMPTY_FORM_STATE, type FormState } from "../form-state";

/**
 * The phone number is the signup's document id, so it is what identifies a row
 * to redeem. The code is never used for this: it is short, guessable and not
 * unique by construction, and the screen already knows which row a button
 * belongs to.
 */
function phoneFrom(formData: FormData): string {
  const value = formData.get("phone");
  return typeof value === "string" ? value.trim() : "";
}

export async function redeemCode(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePosUser();

  const phone = phoneFrom(formData);
  if (phone === "") return { error: "Nothing to redeem." };

  const result = await redeemLaunchOffer(phone, {
    email: user.email,
    name: user.name,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/pos/launch");
  return EMPTY_FORM_STATE;
}

export async function undoRedeem(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePosUser();

  const phone = phoneFrom(formData);
  if (phone === "") return { error: "Nothing to undo." };

  const result = await unredeemLaunchOffer(phone);
  if (!result.ok) return { error: result.error };

  revalidatePath("/pos/launch");
  return EMPTY_FORM_STATE;
}
