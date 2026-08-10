import { timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

import {
  LOGIN_PATH,
  OAUTH_TX_COOKIE,
  POS_PATH,
  callbackUrl,
  isAllowedEmail,
  requireEnv,
  type LoginError,
} from "@/lib/auth/config";
import { expiredOAuthTxCookie, sessionCookie } from "@/lib/auth/session";
import { readOAuthTransaction } from "@/lib/auth/tokens";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

// Module scope so `jose` can cache Google's signing keys across requests.
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Every failure path lands on the login screen with a coarse reason. */
function fail(request: NextRequest, error: LoginError) {
  const response = NextResponse.redirect(
    new URL(`${LOGIN_PATH}?error=${error}`, request.nextUrl),
  );
  response.cookies.set(expiredOAuthTxCookie);
  return response;
}

/** Completes the Google authorization code flow. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // The operator hit "cancel" on Google's consent screen.
  if (params.get("error")) return fail(request, "denied");

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return fail(request, "failed");

  const transaction = await readOAuthTransaction(
    request.cookies.get(OAUTH_TX_COOKIE)?.value,
  );
  // No/expired transaction cookie, or a state that didn't originate here.
  if (!transaction || !constantTimeEquals(state, transaction.state)) {
    return fail(request, "expired");
  }

  try {
    const clientId = requireEnv("GOOGLE_CLIENT_ID");

    const tokenResponse = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
        redirect_uri: callbackUrl(request.nextUrl.origin),
        code_verifier: transaction.codeVerifier,
      }),
      cache: "no-store",
    });

    if (!tokenResponse.ok) {
      console.error(
        "[pos-auth] token exchange failed",
        tokenResponse.status,
        await tokenResponse.text(),
      );
      return fail(request, "failed");
    }

    const { id_token: idToken } = (await tokenResponse.json()) as {
      id_token?: string;
    };
    if (!idToken) {
      console.error("[pos-auth] token response had no id_token");
      return fail(request, "failed");
    }

    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: GOOGLE_ISSUERS,
      audience: clientId,
    });

    // Binds this ID token to the authorization request we just started.
    if (payload.nonce !== transaction.nonce) return fail(request, "expired");

    // A Google account can carry an unverified email; treat it as no email.
    if (payload.email_verified !== true || !isAllowedEmail(payload.email)) {
      console.warn("[pos-auth] rejected sign-in for a non-allowlisted account");
      return fail(request, "forbidden");
    }

    const response = NextResponse.redirect(new URL(POS_PATH, request.nextUrl));
    response.cookies.set(
      await sessionCookie({
        email: payload.email.trim().toLowerCase(),
        name: typeof payload.name === "string" ? payload.name : null,
        picture: typeof payload.picture === "string" ? payload.picture : null,
      }),
    );
    response.cookies.set(expiredOAuthTxCookie);
    return response;
  } catch (error) {
    console.error("[pos-auth] callback failed", error);
    return fail(request, "failed");
  }
}
