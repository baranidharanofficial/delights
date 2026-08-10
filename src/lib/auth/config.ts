/**
 * Shared configuration for the POS Google SSO flow.
 *
 * Kept free of `next/headers` (and of `import "server-only"`) so it can also be
 * imported from `src/proxy.ts`.
 */

/** Fallback owner account — override with `POS_ALLOWED_EMAILS` (comma separated). */
const DEFAULT_ALLOWED_EMAIL = "baranidharanofficial@gmail.com";

export const ALLOWED_EMAILS: readonly string[] = (
  process.env.POS_ALLOWED_EMAILS ?? DEFAULT_ALLOWED_EMAIL
)
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export const SESSION_COOKIE = "delights_pos_session";
/** One shift. Re-authentication is cheap, so keep sessions short. */
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

export const OAUTH_TX_COOKIE = "delights_pos_oauth_tx";
export const OAUTH_TX_TTL_SECONDS = 60 * 10;
/** Scoped so the in-flight OAuth cookie is only ever sent to the callback. */
export const OAUTH_TX_COOKIE_PATH = "/api/auth/google";

export const LOGIN_PATH = "/pos/login";
export const POS_PATH = "/pos";
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

export function isAllowedEmail(email: unknown): email is string {
  return (
    typeof email === "string" &&
    ALLOWED_EMAILS.includes(email.trim().toLowerCase())
  );
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

function resolveOrigin(requestOrigin: string): string {
  if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN;

  const productionDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL_ENV === "production" && productionDomain) {
    return `https://${productionDomain}`;
  }

  return requestOrigin;
}
