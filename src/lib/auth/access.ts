/**
 * Who may reach which part of the POS.
 *
 * One list drives three things that must never disagree: the sections drawn in
 * the navigation panel, the gate each screen calls on the way in, and the
 * coarse check the proxy runs first. A screen that is hidden from someone but
 * still answers a direct request is not restricted, it is only inconvenient.
 *
 * Kept free of `next/headers` and `server-only` so `src/proxy.ts` can import it.
 */

/**
 * The two paths every gate needs to name. They live here, not in `config`, so
 * that this module stays a leaf that `config` and `proxy` can both import.
 */
export const POS_PATH = "/pos";
export const LOGIN_PATH = "/pos/login";

export const POS_ROLES = ["owner", "staff"] as const;
export type PosRole = (typeof POS_ROLES)[number];

export const POS_ROLE_LABELS: Record<PosRole, string> = {
  owner: "Owner",
  staff: "Counter & kitchen",
};

/**
 * The sections, grouped the way the shop thinks about them.
 *
 * `roles` is the authorization rule, not a display hint. Counter and kitchen
 * work is what a shift needs; the office section is the money and the planning,
 * which stays with the owner.
 */
export const POS_SECTIONS = [
  {
    label: "Counter",
    roles: ["owner", "staff"],
    tabs: [
      { href: "/pos", label: "Terminal" },
      { href: "/pos/launch", label: "Launch codes" },
    ],
  },
  {
    label: "Kitchen",
    roles: ["owner", "staff"],
    tabs: [
      { href: "/pos/kitchen", label: "Orders" },
      { href: "/pos/menu", label: "Menu" },
      { href: "/pos/inventory", label: "Inventory" },
      { href: "/pos/production", label: "Production" },
    ],
  },
  {
    label: "Office",
    roles: ["owner"],
    tabs: [
      { href: "/pos/expenses", label: "Expenses" },
      { href: "/pos/reports", label: "Reports" },
      { href: "/pos/tasks", label: "Board" },
      { href: "/pos/qr", label: "QR codes" },
    ],
  },
] as const satisfies readonly {
  label: string;
  roles: readonly PosRole[];
  tabs: readonly { href: string; label: string }[];
}[];

export type PosSection = (typeof POS_SECTIONS)[number];
export type PosTab = PosSection["tabs"][number]["href"];

/**
 * `as const` above narrows each `roles` to its own literal tuple, so this takes
 * the widened view rather than asking a `readonly ["owner"]` whether it
 * contains a value it has already been told it cannot.
 */
function allows(roles: readonly PosRole[], role: PosRole): boolean {
  return roles.includes(role);
}

/** The sections a role may see, in panel order. */
export function sectionsFor(role: PosRole): readonly PosSection[] {
  return POS_SECTIONS.filter((section) => allows(section.roles, role));
}

export function canReach(role: PosRole, tab: PosTab): boolean {
  const section = POS_SECTIONS.find((candidate) =>
    candidate.tabs.some((entry) => entry.href === tab),
  );
  // An href absent from every section is owner-only by default — see below.
  return section ? allows(section.roles, role) : role === "owner";
}

/**
 * Every tab paired with its rule, longest href first.
 *
 * The order is what stops `/pos` — a prefix of every other screen — from
 * answering for all of them.
 */
const RULES = POS_SECTIONS.flatMap((section) =>
  section.tabs.map((tab) => ({ href: tab.href, roles: section.roles })),
).sort((a, b) => b.href.length - a.href.length);

function owns(href: string, pathname: string): boolean {
  if (pathname === href) return true;
  // `/pos` is an ancestor of every other screen, so prefix-matching it would
  // quietly hand the terminal's permissions to anything not listed above —
  // defeating the owner-only default for unlisted paths.
  if (href === POS_PATH) return false;
  return pathname.startsWith(`${href}/`);
}

/**
 * Whether a role may reach a pathname under `/pos`.
 *
 * A path matching no section at all is owner-only. That way a screen added
 * later is private until someone deliberately lists it here, rather than
 * arriving open to everyone because its rule was forgotten.
 */
export function canReachPath(role: PosRole, pathname: string): boolean {
  // Anyone who can hold a session can reach the screen they sign in on. The
  // proxy answers for this path before asking, but it should not be the only
  // thing standing between a cashier and the login form.
  if (pathname === LOGIN_PATH) return true;

  const rule = RULES.find((candidate) => owns(candidate.href, pathname));
  return rule ? allows(rule.roles, role) : role === "owner";
}
