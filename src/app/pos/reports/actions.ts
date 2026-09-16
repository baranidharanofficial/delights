"use server";

import { revalidatePath } from "next/cache";

import { requireSection } from "@/lib/auth/session";
import { deleteOrder, voidOrder } from "@/lib/shop/orders";

import { EMPTY_FORM_STATE, type FormState } from "../form-state";

export async function voidSale(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireSection("/pos/reports");

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

export async function deleteSale(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  // "/pos", not "/pos/reports" — this form also renders on the terminal's
  // "Today's orders" panel, which staff (not just owners) can reach. The
  // explicit role check below is what actually restricts deletion.
  const user = await requireSection("/pos");
  if (user.role !== "owner") {
    return { error: "Only owners can delete orders." };
  }

  const orderId = formData.get("orderId");
  if (typeof orderId !== "string" || orderId === "") {
    return { error: "Nothing to delete." };
  }

  try {
    await deleteOrder(orderId);
  } catch {
    return { error: "Could not delete the order. Try again." };
  }

  revalidatePath("/pos/reports");
  revalidatePath("/pos");
  revalidatePath("/pos/menu");
  revalidatePath("/pos/kitchen");

  return EMPTY_FORM_STATE;
}
