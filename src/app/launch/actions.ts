"use server";

import { claimLaunchOffer, formatPhone } from "@/lib/shop/launch-signups";

import { IDLE_CLAIM, type ClaimState } from "./claim-state";

/**
 * Field no person can see and every naive bot fills in.
 *
 * This is the only public write on the site, so it has no session to check.
 * A honeypot stops the cheap traffic; the real ceiling is `MAX_SIGNUPS`, and
 * a number that submits twice writes to the same document either way.
 */
const HONEYPOT_FIELD = "company";

export async function claimOffer(
  _previous: ClaimState,
  formData: FormData,
): Promise<ClaimState> {
  const filled = formData.get(HONEYPOT_FIELD);
  // Answered with silence rather than an error: a bot learns nothing from
  // being told, and no real submission can reach this branch.
  if (typeof filled === "string" && filled.trim() !== "") return IDLE_CLAIM;

  const phone = formData.get("phone");
  if (typeof phone !== "string" || phone.trim() === "") {
    return { status: "error", message: "Enter your mobile number." };
  }

  const result = await claimLaunchOffer(phone);
  if (!result.ok) return { status: "error", message: result.error };

  return {
    status: "claimed",
    code: result.code,
    phone: formatPhone(result.phone),
    returning: result.returning,
  };
}
