import { requirePosUser } from "@/lib/auth/session";
import { getMenu } from "@/lib/shop/menu";

import PosShell from "../shell";
import MenuEditor from "./menu-editor";

export default async function MenuPage() {
  const user = await requirePosUser();
  const { categories, items } = await getMenu();

  return (
    <PosShell user={user} current="/pos/menu" subtitle="Menu">
      <MenuEditor categories={categories} items={items} />
    </PosShell>
  );
}
