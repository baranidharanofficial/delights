"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { LOGIN_PATH } from "@/lib/auth/config";
import { destroySession, requireSection } from "@/lib/auth/session";
import { placeOrder, type PlaceOrderResult } from "@/lib/shop/orders";
import type { OrderRequestLine, PaymentMethod } from "@/lib/shop/types";

export async function signOut(): Promise<void> {
  await destroySession();
  redirect(LOGIN_PATH);
}

export type CheckoutOptions = {
  couponPhone?: string;
  taxExempt?: boolean;
  discountPercent?: number;
};

/**
 * Takes payment and records the sale.
 *
 * Receives item ids and quantities only. Prices, tax and the total are read and
 * computed server-side in `placeOrder` — a Server Action accepts direct POSTs,
 * so nothing the browser says about money is taken on trust. `date` is trusted
 * no further than that either — `placeOrder` re-validates it can't be in the
 * future before it counts against any day's books. The same distrust covers
 * `taxExempt` and `discountPercent`: the screen the cashier looked at is not
 * proof of what gets charged, so `placeOrder` recomputes the total from these
 * flags rather than accepting one.
 */
export async function checkout(
  lines: OrderRequestLine[],
  method: PaymentMethod,
  date: string,
  options: CheckoutOptions = {},
): Promise<PlaceOrderResult> {
  const user = await requireSection("/pos");

  const result = await placeOrder(
    lines,
    method,
    { email: user.email, name: user.name },
    { targetDate: date, ...options },
  );

  if (result.ok) {
    // Stock came down, so the menu the next render serves is now stale.
    revalidatePath("/pos");
    revalidatePath("/pos/reports");
    revalidatePath("/pos/kitchen");
  }

  return result;
}
