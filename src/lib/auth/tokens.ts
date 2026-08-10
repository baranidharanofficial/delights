/**
 * Signing/verification for the two short-lived tokens this app issues:
 * the POS session and the in-flight OAuth transaction.
 *
 * Importable from `src/proxy.ts` — no `next/headers` in here.
 */
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

import {
  OAUTH_TX_TTL_SECONDS,
  SESSION_TTL_SECONDS,
  isAllowedEmail,
  requireEnv,
} from "./config";

const ALG = "HS256";
const ISSUER = "delights";

const AUDIENCE = {
  session: "delights:pos-session",
  oauthTx: "delights:oauth-tx",
} as const;

type Audience = keyof typeof AUDIENCE;

function signingKey(): Uint8Array {
  return new TextEncoder().encode(requireEnv("SESSION_SECRET"));
}

async function sign(
  payload: JWTPayload,
  audience: Audience,
  ttlSeconds: number,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE[audience])
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(signingKey());
}

async function verify(
  token: string,
  audience: Audience,
): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: [ALG],
      issuer: ISSUER,
      audience: AUDIENCE[audience],
    });
    return payload;
  } catch {
    // Expired, tampered with, or signed under a rotated secret.
    return null;
  }
}

/** The signed-in cashier. Only non-sensitive display data. */
export type PosUser = {
  email: string;
  name: string | null;
  picture: string | null;
};

export function signSession(user: PosUser): Promise<string> {
  return sign({ ...user }, "session", SESSION_TTL_SECONDS);
}

export async function readSession(
  token: string | undefined,
): Promise<PosUser | null> {
  if (!token) return null;

  const payload = await verify(token, "session");
  // Re-check the allowlist on every read: revoking access should only require
  // removing the address, not waiting for live sessions to expire.
  if (!payload || !isAllowedEmail(payload.email)) return null;

  return {
    email: payload.email,
    name: typeof payload.name === "string" ? payload.name : null,
    picture: typeof payload.picture === "string" ? payload.picture : null,
  };
}

/** CSRF/replay state for one authorization round-trip. */
export type OAuthTransaction = {
  state: string;
  nonce: string;
  codeVerifier: string;
};

export function signOAuthTransaction(tx: OAuthTransaction): Promise<string> {
  return sign({ ...tx }, "oauthTx", OAUTH_TX_TTL_SECONDS);
}

export async function readOAuthTransaction(
  token: string | undefined,
): Promise<OAuthTransaction | null> {
  if (!token) return null;

  const payload = await verify(token, "oauthTx");
  if (
    !payload ||
    typeof payload.state !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.codeVerifier !== "string"
  ) {
    return null;
  }

  return {
    state: payload.state,
    nonce: payload.nonce,
    codeVerifier: payload.codeVerifier,
  };
}
