import { requirePosUser } from "@/lib/auth/session";
import { getRecentAdjustments } from "@/lib/shop/finished-stock";
import { getMaterials, getRecentMovements } from "@/lib/shop/materials";
import { getMenuItems } from "@/lib/shop/menu";

import PosHeader from "../header";
import InventoryScreen from "./inventory-screen";

export default async function InventoryPage() {
  const user = await requirePosUser();
  const [items, adjustments, materials, movements] = await Promise.all([
    getMenuItems(),
    getRecentAdjustments(),
    getMaterials(),
    getRecentMovements(),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <PosHeader user={user} current="/pos/inventory" subtitle="Inventory" />
      <InventoryScreen
        items={items}
        adjustments={adjustments}
        materials={materials}
        movements={movements}
      />
    </div>
  );
}
