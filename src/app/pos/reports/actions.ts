"use server";

import { revalidatePath } from "next/cache";

import { requirePosUser } from "@/lib/auth/session";
import { voidOrder } from "@/lib/shop/orders";

import { EMPTY_FORM_STATE, type FormState } from "../form-state";

export async function voidSale(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePosUser();

  const orderId = formData.get("orderId");
  if (typeof orderId !== "string" || orderId === "") {
    return { error: "Nothing to void." };
  }

  const reason = formData.get("reason");
  const restoreStock = formData.get("restoreStock") !== null;

  const result = await voidOrder(
    orderId,
    typeof reason === "string" ? reason : "",
    restoreStock,
    { email: user.email, name: user.name },
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/pos/reports");
  // Returned units are back on the shelf, so the terminal's menu is stale.
  revalidatePath("/pos");
  revalidatePath("/pos/menu");

  return EMPTY_FORM_STATE;
}
