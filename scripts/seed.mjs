/**
 * Loads the menu into Firestore.
 *
 * Run with:  npm run seed
 *            npm run seed -- --reset
 *
 * Without `--reset` it is idempotent: documents use fixed slugs as ids and
 * existing ones are left untouched, so re-running after you have edited prices
 * or stock in the app will not stomp your data. Delete a document to have it
 * recreated.
 *
 * `--reset` first removes every category, every menu item, every recipe and
 * every menu photograph, then rebuilds from the lists below. It is the "the
 * printed menu changed" path, and it throws away edits made in the app.
 *
 * Deleting menu items is safe for the books: order lines snapshot the name and
 * price at the moment of sale, so past receipts and reports do not depend on
 * these documents existing. Raw materials and their photographs are a separate
 * collection and are never touched here.
 *
 * Plain `.mjs` rather than TypeScript so it runs on Node directly, with
 * `--env-file` supplying the same credentials the app uses.
 */

import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

/** `prefix` namespaces the item ids: "Vanilla" is both a shake and an ice cream. */
const CATEGORIES = [
  { id: "milk-shakes", name: "Milk Shakes", prefix: "shake" },
  { id: "fresh-juice", name: "Fresh Juice", prefix: "juice" },
  { id: "lassies", name: "Lassies", prefix: "lassi" },
  { id: "mojitos", name: "Mojitos", prefix: "mojito" },
  { id: "pasta", name: "Pasta", prefix: "pasta" },
  { id: "pizza", name: "Pizza", prefix: "pizza" },
  { id: "burgers", name: "Burgers", prefix: "burger" },
  { id: "nachos", name: "Nachos", prefix: "nachos" },
  { id: "snacks", name: "Snacks", prefix: "snack" },
  { id: "sandwiches", name: "Sandwiches", prefix: "sandwich" },
  { id: "ice-creams", name: "Ice Creams", prefix: "ice" },
  { id: "healthy", name: "Healthy", prefix: "healthy" },
  { id: "combos", name: "Combos", prefix: "combo" },
];

/**
 * The menu, in rupees — converted to paise on the way in, because every stored
 * amount in this app is an integer count of paise.
 */
const MENU = {
  "milk-shakes": [
    ["Vanilla", 59],
    ["Butterscotch", 79],
    ["Black Current", 79],
    ["Chocolate", 69],
    ["Strawberry", 69],
    ["Oreo", 79],
    ["KitKat", 79],
    ["Biscoff (P)", 119],
    ["Cold Coffee", 59],
    ["Badam", 49],
    ["Rose", 49],
    ["Pista", 59],
    ["Brownie (P)", 119],
    ["Mango", 79],
    ["Banana", 59],
  ],
  "fresh-juice": [
    ["Pomegranate", 59],
    ["Orange", 59],
    ["Mosambi", 59],
    ["Watermelon", 39],
    ["Musk Melon", 39],
    ["Lime Soda", 39],
    ["Grape Lime", 49],
    ["Nannari", 49],
    ["Pineapple", 59],
    ["Apple", 69],
  ],
  lassies: [
    ["Sweet / Salt Lassie", 49],
    ["Mango Lassie", 59],
    ["Strawberry Lassie", 59],
    ["Banana Lassie", 59],
  ],
  mojitos: [
    ["Orange Punch", 79],
    ["Virgin Mojito", 59],
    ["Watermelon Mojito", 69],
    ["Blue Mint Mojito", 69],
  ],
  pasta: [
    ["Mix Veg Pasta", 159],
    ["Mushroom Pasta", 169],
    ["Corn Pasta", 169],
    ["Paneer Pasta", 179],
    ["Cheese Burst Pasta (P)", 199],
  ],
  pizza: [
    ["Mushroom Pizza", 189],
    ["Paneer Pizza", 199],
    ["Cheese Burst Pizza", 199],
    ["Corn Pizza", 189],
    ["Mushroom Paneer", 219],
    ["Paneer Corn", 219],
    ["Olive Pizza", 199],
  ],
  burgers: [
    ["Veg Burger", 89],
    ["Cheese Burger", 119],
    ["Paneer Burger", 129],
    ["Paneer & Corn Burger", 129],
  ],
  nachos: [
    ["Veg Nachos", 119],
    ["Cheese Nachos", 139],
  ],
  snacks: [
    ["Coffee", 39],
    ["Black Coffee", 29],
    ["Tea", 29],
    ["Ginger Tea", 29],
    ["Lemon Tea", 29],
    ["Samosa", 29],
    ["Cutlet", 29],
    ["Veg Nuggets", 99],
    ["Cheese Corn Nuggets", 119],
    ["Masala Paneer Nuggets", 119],
    ["French Fries", 119],
    ["Peri Peri French Fries", 139],
  ],
  sandwiches: [
    ["Veg", 79],
    ["Paneer", 99],
    ["Corn", 89],
    ["Cheese Burst", 119],
    ["Cheese & Jam", 89],
    ["Paneer & Corn", 119],
    ["Mushroom & Paneer", 119],
  ],
  "ice-creams": [
    ["Vanilla", 69],
    ["Chocolate", 89],
    ["Strawberry", 89],
    ["Black Currant", 89],
    ["Butterscotch", 89],
    ["Pista", 79],
    ["Mango", 79],
  ],
  healthy: [
    ["Whey Protein Shake", 139],
    ["Dates Shake", 79],
    ["Mixed Dry Fruit", 99],
    ["Dry Badam", 119],
  ],
  combos: [
    ["Peri Peri French Fries + Any Classic Shakes", 169],
    ["Cheese Corn Nuggets + Blue Mint Mojito", 149],
    ["Any Classic Pasta + Any Classic Shake", 249],
    ["Nachos + Any Classic Shake", 149],
  ],
};

/** `"Paneer & Corn Burger"` → `"paneer-and-corn-burger"`. */
function slug(name) {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Flattens the menu into documents.
 *
 * Categories are spaced by tens and items by tens within their category, so you
 * can slot something between two others from the menu screen without
 * renumbering the whole list.
 */
function build() {
  const categories = CATEGORIES.map(({ id, name }, index) => ({
    id,
    name,
    sortOrder: (index + 1) * 10,
  }));

  const items = [];
  for (const { id: categoryId, prefix } of CATEGORIES) {
    const rows = MENU[categoryId] ?? [];
    rows.forEach(([name, rupees], index) => {
      items.push({
        id: `${prefix}-${slug(name)}`,
        name,
        price: rupees * 100,
        categoryId,
        sortOrder: (index + 1) * 10,
      });
    });
  }

  const duplicates = items
    .map(({ id }) => id)
    .filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicates.length > 0) {
    // Two items in one category sharing a slug would silently collapse into a
    // single document, and the menu would come up short with no error anywhere.
    console.error("Duplicate item ids:", duplicates.join(", "));
    process.exit(1);
  }

  return { categories, items };
}

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

const app = initializeApp({
  credential: cert({
    projectId: requireEnv("FIREBASE_PROJECT_ID"),
    clientEmail: requireEnv("FIREBASE_CLIENT_EMAIL"),
    privateKey: requireEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore(app);

function bucket() {
  const name =
    process.env.FIREBASE_STORAGE_BUCKET ||
    `${requireEnv("FIREBASE_PROJECT_ID")}.firebasestorage.app`;
  return getStorage(app).bucket(name);
}

/** Firestore caps a batch at 500 writes; stay well under it. */
const CHUNK = 400;

async function commitAll(refs, apply) {
  for (let start = 0; start < refs.length; start += CHUNK) {
    const batch = db.batch();
    for (const ref of refs.slice(start, start + CHUNK)) apply(batch, ref);
    await batch.commit();
  }
}

async function wipe(collection) {
  const snapshot = await db.collection(collection).get();
  await commitAll(
    snapshot.docs.map((doc) => doc.ref),
    (batch, ref) => batch.delete(ref),
  );
  console.log(`${collection}: ${snapshot.size} deleted`);
}

async function reset() {
  // Recipes are keyed by the menu item's own id, so once the items are gone
  // every recipe is an orphan that nothing can ever resolve again.
  for (const collection of ["menuItems", "categories", "recipes"]) {
    await wipe(collection);
  }

  // Only the `menu/` prefix. Material photographs live under `materials/` and
  // belong to records this script does not manage.
  const [files] = await bucket().getFiles({ prefix: "menu/" });
  await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
  console.log(`storage menu/: ${files.length} deleted`);
}

async function seed(collection, documents, shape) {
  const existing = await db.getAll(
    ...documents.map(({ id }) => db.collection(collection).doc(id)),
  );
  const present = new Set(
    existing.filter((doc) => doc.exists).map((doc) => doc.id),
  );

  const missing = documents.filter(({ id }) => !present.has(id));
  await commitAll(missing, (batch, document) =>
    batch.set(db.collection(collection).doc(document.id), shape(document)),
  );

  console.log(
    `${collection}: ${missing.length} created, ${present.size} already present`,
  );
}

const { categories, items } = build();

if (process.argv.includes("--reset")) {
  console.log("Resetting the menu…");
  await reset();
}

await seed("categories", categories, ({ name, sortOrder }) => ({
  name,
  sortOrder,
}));

// Items start untracked (`stock: null`) and with no photograph. Counting one
// begins on the inventory screen; pictures are added from the menu screen.
await seed("menuItems", items, ({ name, price, categoryId, sortOrder }) => ({
  name,
  price,
  categoryId,
  available: true,
  stock: null,
  sortOrder,
  imageKey: null,
}));

console.log(`Done — ${categories.length} categories, ${items.length} items.`);
process.exit(0);
