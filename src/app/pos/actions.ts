"use server";

import { redirect } from "next/navigation";

import { LOGIN_PATH } from "@/lib/auth/config";
import { destroySession } from "@/lib/auth/session";

export async function signOut(): Promise<void> {
  await destroySession();
  redirect(LOGIN_PATH);
}
