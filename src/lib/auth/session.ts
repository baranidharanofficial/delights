import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { canReach, type PosTab } from "./access";
import {
  IS_PROD,
  LOGIN_PATH,
  OAUTH_TX_COOKIE,
  OAUTH_TX_COOKIE_PATH,
  POS_PATH,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "./config";
import {
  readSession,
  signSession,
  type PosIdentity,
  type PosUser,
} from "./tokens";

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  // `lax` (not `strict`) so the cookie is sent on the top-level navigation
  // Google performs back into the app.
  sameSite: "lax",
  secure: IS_PROD,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
} as const;

/**
 * Cookie descriptor for a freshly authenticated user, shaped for
 * `NextResponse.cookies.set()`.
 *
 * The OAuth callback builds its own redirect response, so it sets the cookie
 * there rather than through `next/headers` — mixing the two on one response is
 * needless ambiguity.
 */
export async function sessionCookie(user: PosIdentity) {
  return {
    name: SESSION_COOKIE,
    value: await signSession(user),
    ...SESSION_COOKIE_OPTIONS,
  };
}

/** Expires the in-flight OAuth transaction cookie. Must reuse its exact path. */
export const expiredOAuthTxCookie = {
  name: OAUTH_TX_COOKIE,
  value: "",
  httpOnly: true,
  sameSite: "lax",
  secure: IS_PROD,
  path: OAUTH_TX_COOKIE_PATH,
  maxAge: 0,
} as const;

/** Call only from a Route Handler or Server Function. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * The signed-in POS user, or `null`. Memoized per render pass so several
 * components can ask without re-verifying the token.
 */
export const getPosUser = cache(async (): Promise<PosUser | null> => {
  const cookieStore = await cookies();
  return readSession(cookieStore.get(SESSION_COOKIE)?.value);
});

/**
 * Authorization gate for everything under /pos. `src/proxy.ts` does the same
 * check first, but this is the one that actually protects the data — proxy
 * matchers can drift, this cannot.
 */
export async function requirePosUser(): Promise<PosUser> {
  const user = await getPosUser();
  if (!user) redirect(LOGIN_PATH);
  return user;
}

/**
 * Authorization gate for one screen — signed in, *and* allowed in here.
 *
 * Every page and every Server Action under `/pos` names the tab it belongs to.
 * The proxy makes the same check first, but a matcher is a list that can drift
 * and a Server Action is reachable by direct POST; this is the check that
 * actually holds. Naming the tab at each entry point also means a new screen
 * has to state where it belongs before it can be reached at all.
 *
 * Refusal is a bounce to the terminal rather than an error page. Everyone who
 * can sign in can work the counter, so it is always somewhere they can be.
 */
export async function requireSection(tab: PosTab): Promise<PosUser> {
  const user = await requirePosUser();
  if (!canReach(user.role, tab)) redirect(POS_PATH);
  return user;
}
