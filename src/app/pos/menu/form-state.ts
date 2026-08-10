/**
 * Shared shape for the menu screen's `useActionState` forms.
 *
 * Separate from `actions.ts` because a `"use server"` module may only export
 * async functions — a plain constant living there is a build error.
 */

/** `null` error means the last submission succeeded. */
export type MenuFormState = { error: string | null };

export const EMPTY_FORM_STATE: MenuFormState = { error: null };
