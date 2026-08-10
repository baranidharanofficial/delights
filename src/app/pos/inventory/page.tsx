import { requirePosUser } from "@/lib/auth/session";
import { getMaterials, getRecentMovements } from "@/lib/shop/materials";

import PosHeader from "../header";
import InventoryScreen from "./inventory-screen";

export default async function InventoryPage() {
  const user = await requirePosUser();
  const [materials, movements] = await Promise.all([
    getMaterials(),
    getRecentMovements(),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <PosHeader user={user} current="/pos/inventory" subtitle="Inventory" />
      <InventoryScreen materials={materials} movements={movements} />
    </div>
  );
}
