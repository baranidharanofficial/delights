import { requirePosUser } from "@/lib/auth/session";
import { getMaterials } from "@/lib/shop/materials";
import { getMenuItems } from "@/lib/shop/menu";
import { getRecentProductions } from "@/lib/shop/production";
import { getRecipes } from "@/lib/shop/recipes";

import PosShell from "../shell";
import ProductionScreen from "./production-screen";

export default async function ProductionPage() {
  const user = await requirePosUser();

  const [items, materials, recipes, productions] = await Promise.all([
    getMenuItems(),
    getMaterials(),
    getRecipes(),
    getRecentProductions(),
  ]);

  return (
    <PosShell user={user} current="/pos/production" subtitle="Production">
      <ProductionScreen
        items={items}
        // A Map does not survive the Server → Client boundary.
        recipes={[...recipes.values()]}
        materials={materials}
        productions={productions}
      />
    </PosShell>
  );
}
