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

### Getting around

Every signed-in screen is wrapped by [PosShell](src/app/pos/shell.tsx): a
navigation panel down the left, and a slim bar across the top for the page's
name and the account. The sections are grouped — Counter, Kitchen, Office —
rather than listed flat, because seven destinations in a row stops reading as a
set of choices.

The panel is a side panel only where there is width for one. Below `md` the same
markup lays itself back across the top as a scrolling row of pills. That is done
in CSS rather than with a drawer, which keeps the whole shell a Server Component
and sidesteps the bug every drawer has: it must be told to close on each
navigation, and forgets to exactly once.

### Board (`/pos/tasks`)

A three-column Kanban — To do, In progress, Done — for the shop's own work:
reorder the gas, chase the oven repair. Cards carry a priority, a due date and
whoever is on it; anything overdue is outlined in red and counted in the title
bar.

Cards move by dragging, or by the arrows beside them — the arrows are the ones
that matter on the counter tablet, where nothing can be dragged. Position is a
plain integer per column, rewritten to contiguous steps on every move, so
ordering can never drift.

Done cards stay until someone presses **Clear**. A finished chore is not a
business record the way a sale or a stock movement is, and keeping every one of
them forever would turn the board into a log.

### Expenses (`/pos/expenses`)

Money out, a month at a time: rent, wages, packaging, repairs. Each entry has a
date, category, description, who it was paid to, the amount and how it was paid
— including **Bank**, which is not a payment method a sale can ever use.

Raw materials are deliberately **not** entered here. Buying flour already leaves
a receipt in the material ledger (Inventory → Receive), where it also sets what
the stock on hand is worth. The screen reads that figure back out of the ledger
and shows it beside its own total, so a month's outgoings add up without either
record having to know about the other — and without the same invoice being
counted twice.

Business dates are stored as `YYYY-MM-DD` strings, whose lexical order is their
chronological order, so a month is one range query against the single-field
index Firestore maintains by default. No composite index to declare or deploy.

The product catalog in [src/app/pos/catalog.ts](src/app/pos/catalog.ts) is
placeholder data, and completed orders are not persisted anywhere yet.

## Public menu (`/menu`)

The customer-facing menu, open to anyone. It reads the same `categories` and
`menuItems` the terminal sells from, so there is no second copy of the menu to
keep in step — grouped into sections, empty ones dropped.

An item taken off the menu by hand is not listed at all. One that is stock
tracked and down to zero is listed and marked *Sold out*, because a customer is
better served knowing the shop makes it than wondering whether it exists.

The page is prerendered rather than rendered per visit. Menu edits push a fresh
copy immediately — [the menu actions](src/app/pos/menu/actions.ts) revalidate
`/menu` alongside the POS screens — while `revalidate = 60` covers the one thing
no edit announces: stock moving under a sale or a bake. So a price change is
live at once, and a *Sold out* badge is at most a minute behind.

Because the page is prerendered at build time, `next build` reads Firestore and
needs the `FIREBASE_*` variables present in the build environment.

### Loading the menu

[scripts/seed.mjs](scripts/seed.mjs) holds the printed menu — categories, item
names and rupee prices — and writes it into Firestore:

```bash
npm run seed            # create anything missing, touch nothing else
npm run seed -- --reset # wipe the menu and rebuild it from the script
```

Plain `seed` is idempotent: ids are fixed slugs, and documents that already
exist are left alone, so it will not stomp prices or stock you have edited in
the app. `--reset` is the "the printed menu changed" path — it deletes every
category, item, recipe and menu photograph first, and does throw away those
edits.

Deleting items is safe for the books either way: order lines snapshot the name
and price at the moment of sale, so past receipts and reports do not depend on
the items still existing. Raw materials and their photographs live in their own
collections and are never touched.

Item ids are namespaced by category (`shake-vanilla`, `ice-vanilla`) because the
same name legitimately appears on both ends of the menu. The script refuses to
run if two items in one category would collide.

### Menu pictures

[/api/images](src/app/api/images/[...key]/route.ts) serves both kinds of image
out of the private bucket, and the object key decides who may see one: anything
under `menu/` is public, everything else still requires a POS session. Menu
photographs are the one class of image whose purpose is to be shown to people
who will never sign in; material photographs are not, and stay gated.


This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
