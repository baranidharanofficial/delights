import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import {
  ALLOWED_EMAILS,
  IS_PROD,
  LOGIN_PATH,
  OAUTH_TX_COOKIE,
  OAUTH_TX_COOKIE_PATH,
  OAUTH_TX_TTL_SECONDS,
  callbackUrl,
  requireEnv,
} from "@/lib/auth/config";
import { signOAuthTransaction } from "@/lib/auth/tokens";

const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

function randomUrlSafe(): string {
  return randomBytes(32).toString("base64url");
}

/** Starts the Google authorization code flow (with PKCE). */
export async function GET(request: NextRequest) {
  let clientId: string;
  try {
    clientId = requireEnv("GOOGLE_CLIENT_ID");
    requireEnv("GOOGLE_CLIENT_SECRET");
    requireEnv("SESSION_SECRET");
  } catch (error) {
    console.error("[pos-auth] misconfigured Google SSO", error);
    return NextResponse.redirect(
      new URL(`${LOGIN_PATH}?error=failed`, request.nextUrl),
    );
  }

  const state = randomUrlSafe();
  const nonce = randomUrlSafe();
  const codeVerifier = randomUrlSafe();
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(request.nextUrl.origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    // Always let the operator pick an account rather than silently reusing a
    // signed-in one that would just be rejected by the allowlist.
    prompt: "select_account",
  });
  // Pre-selects the store account on Google's chooser. Purely a convenience.
  if (ALLOWED_EMAILS.length === 1) params.set("login_hint", ALLOWED_EMAILS[0]);

  const authorize = new URL(AUTHORIZE_ENDPOINT);
  authorize.search = params.toString();

  const response = NextResponse.redirect(authorize);
  response.cookies.set(
    OAUTH_TX_COOKIE,
    await signOAuthTransaction({ state, nonce, codeVerifier }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: IS_PROD,
      path: OAUTH_TX_COOKIE_PATH,
      maxAge: OAUTH_TX_TTL_SECONDS,
    },
  );
  return response;
}
