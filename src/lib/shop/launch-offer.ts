/**
 * The launch offer's terms, as both the page and the server read them.
 *
 * Kept out of `launch-signups.ts` for the same reason `types.ts` is kept free of
 * `firebase-admin`: that module is `server-only`, and the claim form is a client
 * component that has to print the same number the signup is stamped with. One
 * constant, two bundles.
 */
export const LAUNCH_DISCOUNT_PERCENT = 50;

/** `50% off` — the offer in the one phrase that appears all over the page. */
export const LAUNCH_DISCOUNT_LABEL = `${LAUNCH_DISCOUNT_PERCENT}% off`;
