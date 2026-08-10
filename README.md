This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## POS terminal (`/pos`)

`/pos` is a staff-only point-of-sale terminal behind Google SSO. Only the
accounts on the allowlist can open it — by default just
`baranidharanofficial@gmail.com`.

### One-time Google setup

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials),
   create an **OAuth client ID** of type **Web application**.
2. Add the authorised redirect URIs:
   - `http://localhost:3000/api/auth/google/callback` (development)
   - `https://<your-domain>/api/auth/google/callback` (production)
3. On the **OAuth consent screen**, publishing status can stay *Testing* — just
   add the allowlisted address as a test user.

### Environment

Copy `.env.example` to `.env.local` and fill it in:

```bash
cp .env.example .env.local
openssl rand -base64 32   # value for SESSION_SECRET
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | yes | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | yes | OAuth client secret |
| `SESSION_SECRET` | yes | Signs the session cookie (32+ random bytes) |
| `POS_ALLOWED_EMAILS` | no | Comma-separated allowlist; defaults to the owner account |
| `APP_ORIGIN` | no | Public origin, when it differs from the request host |

Rotating `SESSION_SECRET` invalidates every live POS session.

### How access is enforced

| Layer | File | Role |
| --- | --- | --- |
| Proxy | [src/proxy.ts](src/proxy.ts) | Optimistic cookie check; bounces `/pos/*` to the login screen |
| Session | [src/lib/auth/tokens.ts](src/lib/auth/tokens.ts) | HS256 session JWT, 12h TTL, allowlist re-checked on every read |
| Gate | [src/lib/auth/session.ts](src/lib/auth/session.ts) | `requirePosUser()` — the authoritative check each `/pos` route calls |
| Sign in | [src/app/api/auth/google/login/route.ts](src/app/api/auth/google/login/route.ts) | Authorization-code flow with PKCE, `state` and `nonce` |
| Callback | [src/app/api/auth/google/callback/route.ts](src/app/api/auth/google/callback/route.ts) | Verifies Google's ID token against its JWKS, then the allowlist |

Removing an address from `POS_ALLOWED_EMAILS` revokes access immediately —
existing sessions stop working on their next request rather than lingering
until they expire.

The product catalog in [src/app/pos/catalog.ts](src/app/pos/catalog.ts) is
placeholder data, and completed orders are not persisted anywhere yet.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
