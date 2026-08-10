/**
 * Shared shape for every `useActionState` form on the POS admin screens.
 *
 * Kept out of the `actions.ts` files because a `"use server"` module may only
 * export async functions — a plain constant living there is a build error.
 */

/** `null` error means the last submission succeeded. */
export type FormState = { error: string | null };

export const EMPTY_FORM_STATE: FormState = { error: null };

/** Which collection an image is being attached to. */
export const IMAGE_TARGETS = ["menuItems", "materials"] as const;
export type ImageTarget = (typeof IMAGE_TARGETS)[number];

export function isImageTarget(value: unknown): value is ImageTarget {
  return IMAGE_TARGETS.includes(value as ImageTarget);
}
