"use server";

import { revalidatePath } from "next/cache";

import { requireSection } from "@/lib/auth/session";
import { markLine, markOrder, type Actor } from "@/lib/shop/kitchen";

import { EMPTY_FORM_STATE, type FormState } from "../form-state";

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

async function actor(): Promise<Actor> {
  const user = await requireSection("/pos/kitchen");
  return { email: user.email, name: user.name };
}

/**
 * Both actions carry the state they want rather than toggling whatever is
 * there. Two cooks tapping the same item within a second of each other should
 * land on "made" twice, not "made" and then "not made".
 */
function wanted(formData: FormData): boolean {
  return text(formData, "done") === "1";
}

export async function setItemDone(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const who = await actor();

  const result = await markLine(
    text(formData, "orderId"),
    text(formData, "itemId"),
    wanted(formData),
    who,
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/pos/kitchen");
  return EMPTY_FORM_STATE;
}

export async function setTicketDone(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const who = await actor();

  const result = await markOrder(
    text(formData, "orderId"),
    wanted(formData),
    who,
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/pos/kitchen");
  return EMPTY_FORM_STATE;
}
