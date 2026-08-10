"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { LOGIN_PATH } from "@/lib/auth/config";
import { destroySession, requirePosUser } from "@/lib/auth/session";
import { placeOrder, type PlaceOrderResult } from "@/lib/shop/orders";
import type { OrderRequestLine, PaymentMethod } from "@/lib/shop/types";

export async function signOut(): Promise<void> {
  await destroySession();
  redirect(LOGIN_PATH);
}

/**
 * Takes payment and records the sale.
 *
 * Receives item ids and quantities only. Prices, tax and the total are read and
 * computed server-side in `placeOrder` — a Server Action accepts direct POSTs,
 * so nothing the browser says about money is taken on trust.
 */
export async function checkout(
  lines: OrderRequestLine[],
  method: PaymentMethod,
): Promise<PlaceOrderResult> {
  const user = await requirePosUser();

  const result = await placeOrder(lines, method, {
    email: user.email,
    name: user.name,
  });

  if (result.ok) {
    // Stock came down, so the menu the next render serves is now stale.
    revalidatePath("/pos");
    revalidatePath("/pos/reports");
  }

  return result;
}
