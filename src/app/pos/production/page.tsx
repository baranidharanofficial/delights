import { requirePosUser } from "@/lib/auth/session";
import { getMaterials } from "@/lib/shop/materials";
import { getMenuItems } from "@/lib/shop/menu";
import { getRecentProductions } from "@/lib/shop/production";
import { getRecipes } from "@/lib/shop/recipes";

import PosHeader from "../header";
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
    <div className="flex flex-1 flex-col">
      <PosHeader user={user} current="/pos/production" subtitle="Production" />
      <ProductionScreen
        items={items}
        // A Map does not survive the Server → Client boundary.
        recipes={[...recipes.values()]}
        materials={materials}
        productions={productions}
      />
    </div>
  );
}
