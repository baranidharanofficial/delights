import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { requireEnv } from "@/lib/auth/config";

/**
 * Firestore through the Admin SDK, server-side only.
 *
 * The POS authenticates with its own Google OAuth session (see
 * `lib/auth/session.ts`), not Firebase Auth, so there is no Firebase identity to
 * hang security rules off. Every read and write therefore goes through the
 * server, where `requirePosUser()` is the single authorization gate and the
 * service account never leaves the machine. `firestore.rules` denies all client
 * access outright — the Admin SDK bypasses rules by design.
 */

/**
 * Vercel (and most dashboards) store multi-line values with the newlines
 * escaped. A key that still contains a literal backslash-n fails to parse with
 * an error that points nowhere useful, so normalise it here.
 */
function privateKey(): string {
  return requireEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
}

function initialize(): App {
  // `getApps()` is the guard that matters in dev: the module is re-evaluated on
  // every HMR pass, and initializing a second app with the same name throws.
  const [existing] = getApps();
  if (existing) return existing;

  return initializeApp({
    credential: cert({
      projectId: requireEnv("FIREBASE_PROJECT_ID"),
      clientEmail: requireEnv("FIREBASE_CLIENT_EMAIL"),
      privateKey: privateKey(),
    }),
  });
}

/**
 * The initialized Admin app, for SDKs other than Firestore.
 *
 * Safe to call repeatedly — `initialize()` returns the existing app rather than
 * creating a second one.
 */
export function getApp(): App {
  return initialize();
}

/**
 * Cached on `globalThis`, not in a module variable.
 *
 * Next evaluates this module more than once — per route bundle, and again on
 * every HMR pass. `getFirestore()` hands back the *same* instance each time
 * (it is cached on the App), but `settings()` may only ever be called once on
 * it, so a per-module cache means the second evaluation throws "Firestore has
 * already been initialized". A global key is the only cache that outlives the
 * module.
 */
const FIRESTORE = Symbol.for("delights.firestore");

type GlobalWithFirestore = typeof globalThis & {
  [FIRESTORE]?: Firestore;
};

export function getDb(): Firestore {
  const globals = globalThis as GlobalWithFirestore;

  const cached = globals[FIRESTORE];
  if (cached) return cached;

  const firestore = getFirestore(initialize());
  // A field set to `undefined` would otherwise throw on write. Treating it as
  // "leave this field out" is what every call site here actually wants.
  firestore.settings({ ignoreUndefinedProperties: true });
  globals[FIRESTORE] = firestore;

  return firestore;
}

export const COLLECTIONS = {
  categories: "categories",
  menuItems: "menuItems",
  orders: "orders",
  /** One doc per business date, holding that day's receipt-number sequence. */
  counters: "counters",
  /** Raw materials — flour, butter, cups. */
  materials: "materials",
  /** Append-only ledger explaining every change to a material's stock. */
  materialMovements: "materialMovements",
  /** One doc per menu item, keyed by that item's id. */
  recipes: "recipes",
  /** Completed bakes: materials out, finished units in. */
  productions: "productions",
  /** Hand corrections to a menu item's finished count. */
  stockAdjustments: "stockAdjustments",
  /** Cards on the shop's board — one doc per task. */
  tasks: "tasks",
  /** Money out, recorded by hand. */
  expenses: "expenses",
  /** Launch-offer signups, one doc per phone number, keyed by that number. */
  launchSignups: "launchSignups",
} as const;
