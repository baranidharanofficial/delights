/**
 * Loads the starting menu into Firestore.
 *
 * Run with:  npm run seed
 *
 * Idempotent by design — documents use fixed slugs as ids and existing ones are
 * left untouched, so re-running after you have edited prices or stock in the app
 * will not stomp your data. Delete a document to have it recreated.
 *
 * Plain `.mjs` rather than TypeScript so it runs on Node directly, with
 * `--env-file` supplying the same credentials the app uses.
 */

import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const CATEGORIES = [
  { id: "cakes", name: "Cakes", sortOrder: 10 },
  { id: "pastries", name: "Pastries", sortOrder: 20 },
  { id: "cookies", name: "Cookies", sortOrder: 30 },
  { id: "beverages", name: "Beverages", sortOrder: 40 },
];

/** Prices are paise. Stock starts untracked (`null`) — set it in the app. */
const ITEMS = [
  { id: "cake-truffle", name: "Belgian Truffle Slice", price: 19000, categoryId: "cakes" },
  { id: "cake-red-velvet", name: "Red Velvet Slice", price: 21000, categoryId: "cakes" },
  { id: "cake-cheesecake", name: "Blueberry Cheesecake", price: 24000, categoryId: "cakes" },
  { id: "cake-coconut", name: "Tender Coconut Cake", price: 22000, categoryId: "cakes" },

  { id: "pastry-croissant", name: "Butter Croissant", price: 11000, categoryId: "pastries" },
  { id: "pastry-danish", name: "Almond Danish", price: 14000, categoryId: "pastries" },
  { id: "pastry-eclair", name: "Chocolate Éclair", price: 13000, categoryId: "pastries" },
  { id: "pastry-cinnamon", name: "Cinnamon Roll", price: 12000, categoryId: "pastries" },

  { id: "cookie-double-choc", name: "Double Chocolate Cookie", price: 7000, categoryId: "cookies" },
  { id: "cookie-oatmeal", name: "Oatmeal Raisin Cookie", price: 6500, categoryId: "cookies" },
  { id: "cookie-caramel", name: "Salted Caramel Cookie", price: 7500, categoryId: "cookies" },
  { id: "cookie-brownie", name: "Fudge Brownie Square", price: 9000, categoryId: "cookies" },

  { id: "drink-filter-coffee", name: "Filter Coffee", price: 8000, categoryId: "beverages" },
  { id: "drink-cold-brew", name: "Cold Brew", price: 16000, categoryId: "beverages" },
  { id: "drink-chai", name: "Masala Chai", price: 6000, categoryId: "beverages" },
  { id: "drink-lime-soda", name: "Fresh Lime Soda", price: 9000, categoryId: "beverages" },
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(
      `Missing ${name}. Run with: node --env-file=.env.local scripts/seed.mjs`,
    );
    process.exit(1);
  }
  return value;
}

const db = getFirestore(
  initializeApp({
    credential: cert({
      projectId: requireEnv("FIREBASE_PROJECT_ID"),
      clientEmail: requireEnv("FIREBASE_CLIENT_EMAIL"),
      privateKey: requireEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  }),
);

async function seed(collection, documents, build) {
  const existing = await db.getAll(
    ...documents.map(({ id }) => db.collection(collection).doc(id)),
  );
  const present = new Set(
    existing.filter((doc) => doc.exists).map((doc) => doc.id),
  );

  const missing = documents.filter(({ id }) => !present.has(id));
  if (missing.length > 0) {
    const batch = db.batch();
    for (const document of missing) {
      batch.set(db.collection(collection).doc(document.id), build(document));
    }
    await batch.commit();
  }

  console.log(
    `${collection}: ${missing.length} created, ${present.size} already present`,
  );
}

await seed("categories", CATEGORIES, ({ name, sortOrder }) => ({
  name,
  sortOrder,
}));

// Spaced by tens so you can slot an item between two others from the menu
// screen without renumbering the whole list.
const ORDERED_ITEMS = ITEMS.map((item, index) => ({
  ...item,
  sortOrder: (index + 1) * 10,
}));

await seed(
  "menuItems",
  ORDERED_ITEMS,
  ({ name, price, categoryId, sortOrder }) => ({
    name,
    price,
    categoryId,
    available: true,
    stock: null,
    sortOrder,
  }),
);

console.log("Done.");
process.exit(0);
