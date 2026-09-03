/**
 * The launch offer's terms, as both the page and the server read them.
 *
 * Kept out of `launch-signups.ts` for the same reason `types.ts` is kept free of
 * `firebase-admin`: that module is `server-only`, and the claim form is a client
 * component that has to print the same terms the signup is stamped with. One
 * module, two bundles.
 */

/**
 * The offer is the milkshake itself, so the discount a signup is stamped with is
 * the whole price. It is written onto every signup rather than inferred at the
 * counter, so a code claimed today still says what it was worth if the terms
 * ever change under it.
 */
export const LAUNCH_DISCOUNT_PERCENT = 100;

/** `a free milkshake` — the offer in the phrase that appears all over the page. */
export const LAUNCH_OFFER_LABEL = "a free milkshake";

/**
 * Signups the shop will take — a hundred free milkshakes.
 *
 * This is advertised now rather than a private ceiling: "the first hundred" is
 * printed on the page, so the number the page promises and the number the
 * server enforces have to be the same one. That is why it lives here and not
 * beside the write that checks it — the launch page is otherwise entirely
 * static, and importing it from `launch-signups.ts` would pull `firebase-admin`
 * into the module graph of a page that never touches Firestore.
 *
 * A number already on the list keeps getting its code back after the cap is
 * reached; only numbers new to the list are turned away.
 */
export const MAX_SIGNUPS = 100;

/**
 * `the first 100 numbers` — the cap as the page states it.
 *
 * One interpolation rather than `{MAX_SIGNUPS} numbers` written inline in JSX,
 * because the compiler eats the space on both sides of an interpolation that
 * sits in wrapped prose: a text chunk *following* an expression loses its
 * leading space, and a chunk *preceding* one loses its trailing space if the
 * line happens to break there. Either way a customer reads "100numbers".
 *
 * So the phrase is one expression, and the page writes an explicit `{" "}`
 * ahead of it and lets punctuation follow it directly. Keep that shape if you
 * reword the copy — the failure is silent and only shows up in the rendered
 * page, never in a type error or a lint warning.
 */
export const LAUNCH_CAP_LABEL = `the first ${MAX_SIGNUPS} numbers`;
