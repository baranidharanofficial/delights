import { requireSection } from "@/lib/auth/session";
import { getRecentAdjustments } from "@/lib/shop/finished-stock";
import { getMaterials, getRecentMovements } from "@/lib/shop/materials";
import { getMenuItems } from "@/lib/shop/menu";

import PosShell from "../shell";
import InventoryScreen from "./inventory-screen";

export default async function InventoryPage() {
  const user = await requireSection("/pos/inventory");
  const [items, adjustments, materials, movements] = await Promise.all([
    getMenuItems(),
    getRecentAdjustments(),
    getMaterials(),
    getRecentMovements(),
  ]);

  return (
    <PosShell user={user} current="/pos/inventory" subtitle="Inventory">
      <InventoryScreen
        items={items}
        adjustments={adjustments}
        materials={materials}
        movements={movements}
      />
    </PosShell>
  );
}
