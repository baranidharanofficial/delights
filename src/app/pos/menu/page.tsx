import { requirePosUser } from "@/lib/auth/session";
import { getMenu } from "@/lib/shop/menu";

import PosHeader from "../header";
import MenuEditor from "./menu-editor";

export default async function MenuPage() {
  const user = await requirePosUser();
  const { categories, items } = await getMenu();

  return (
    <div className="flex flex-1 flex-col">
      <PosHeader user={user} current="/pos/menu" subtitle="Menu" />
      <MenuEditor categories={categories} items={items} />
    </div>
  );
}
