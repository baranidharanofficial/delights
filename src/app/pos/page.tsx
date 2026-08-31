import { requirePosUser } from "@/lib/auth/session";
import { getMenu } from "@/lib/shop/menu";

import PosShell from "./shell";
import PosTerminal from "./terminal";

export default async function PosPage() {
  // Authoritative check — the proxy gate is only an optimisation.
  const user = await requirePosUser();
  const { categories, items } = await getMenu();

  return (
    <PosShell user={user} current="/pos" subtitle="Counter 1">
      <PosTerminal categories={categories} items={items} />
    </PosShell>
  );
}
