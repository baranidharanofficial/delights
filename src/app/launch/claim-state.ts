/**
 * What the claim form shows after a submission.
 *
 * Lives beside the action rather than in it because a `"use server"` module may
 * only export async functions, and the form needs the initial value as well as
 * the type. It is deliberately not the POS's `FormState`: this form has a
 * success worth rendering — the code — not just an error worth clearing.
 */
export type ClaimState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "claimed";
      code: string;
      /** `+91 98765 43210`, read back so a typo is obvious. */
      phone: string;
      /** This number was already on the list; the code is the original one. */
      returning: boolean;
    };

export const IDLE_CLAIM: ClaimState = { status: "idle" };
