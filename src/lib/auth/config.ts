/**
 * Shared configuration for the POS Google SSO flow.
 *
 * Kept free of `next/headers` (and of `import "server-only"`) so it can also be
 * imported from `src/proxy.ts`.
 */

import { LOGIN_PATH, POS_PATH, type PosRole } from "./access";

/** Fallback owner account — override with `POS_ALLOWED_EMAILS` (comma separated). */
const DEFAULT_ALLOWED_EMAIL = "baranidharanofficial@gmail.com";

/** Fallback counter account — override with `POS_STAFF_EMAILS` (comma separated). */
const DEFAULT_STAFF_EMAIL = "baranidharan958@gmail.com";

function emailList(value: string): readonly string[] {
  return value
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** Full run of the shop, office included. */
export const OWNER_EMAILS = emailList(
  process.env.POS_ALLOWED_EMAILS ?? DEFAULT_ALLOWED_EMAIL,
);

/** Counter and kitchen only — no expenses, reports or board. */
export const STAFF_EMAILS = emailList(
  process.env.POS_STAFF_EMAILS ?? DEFAULT_STAFF_EMAIL,
);

/** Everyone who may sign in at all, whatever they are allowed to do after. */
export const ALLOWED_EMAILS: readonly string[] = [
  ...OWNER_EMAILS,
  ...STAFF_EMAILS.filter((email) => !OWNER_EMAILS.includes(email)),
];

export const SESSION_COOKIE = "delights_pos_session";
/** One shift. Re-authentication is cheap, so keep sessions short. */
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

export const OAUTH_TX_COOKIE = "delights_pos_oauth_tx";
export const OAUTH_TX_TTL_SECONDS = 60 * 10;
/** Scoped so the in-flight OAuth cookie is only ever sent to the callback. */
export const OAUTH_TX_COOKIE_PATH = "/api/auth/google";

// Declared in `access` alongside the rules that match on them, and re-exported
// here so the many existing importers of this module keep working.
export { LOGIN_PATH, POS_PATH };
export const CALLBACK_PATH = "/api/auth/google/callback";

export const IS_PROD = process.env.NODE_ENV === "production";

export type LoginError =
  | "forbidden"
  | "expired"
  | "denied"
  | "misconfigured"
  | "failed";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`,
    );
  }
  return value;
}

/**
 * What an address is allowed to do, or `null` if it may not sign in.
 *
 * The owner list is consulted first, so an address that somehow appears on both
 * is an owner. Listing someone as an owner is the deliberate act of the two.
 */
export function roleFor(email: unknown): PosRole | null {
  if (typeof email !== "string") return null;

  const normalised = email.trim().toLowerCase();
  if (OWNER_EMAILS.includes(normalised)) return "owner";
  if (STAFF_EMAILS.includes(normalised)) return "staff";
  return null;
}

export function isAllowedEmail(email: unknown): email is string {
  return roleFor(email) !== null;
}

/**
 * Absolute redirect URI handed to Google. Must match an "Authorised redirect
 * URI" on the OAuth client *exactly*, which makes the origin the fragile part:
 *
 * 1. `APP_ORIGIN` wins — for proxies that rewrite Host, or to pin a custom domain.
 * 2. On Vercel production, prefer the stable project domain. Every deployment
 *    also gets a unique `*-<hash>.vercel.app` URL, and reaching the app through
 *    one of those would otherwise derive an unregistered redirect URI.
 * 3. Otherwise trust the request (localhost, self-hosted, preview deploys).
 */
export function callbackUrl(requestOrigin: string): string {
  const origin = resolveOrigin(requestOrigin);
  return new URL(CALLBACK_PATH, origin).href;
}

/**
 * The same origin resolution `callbackUrl` uses, exposed for anything else
 * that has to hand out an absolute URL — a QR code's target has to survive
 * being printed and scanned from outside the request that generated it, so it
 * cannot lean on a relative path the way a page's own links can.
 */
export function resolveOrigin(requestOrigin: string): string {
  if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN;

  const productionDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL_ENV === "production" && productionDomain) {
    return `https://${productionDomain}`;
  }

  return requestOrigin;
}
