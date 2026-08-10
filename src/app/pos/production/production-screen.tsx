"use client";

import { useActionState, useMemo, useState } from "react";

import { formatIstTime } from "@/lib/shop/dates";
import { formatMoney } from "@/lib/shop/money";
import { ENTRY_UNITS, formatQuantity, valueOf } from "@/lib/shop/units";
import type {
  Material,
  MenuItem,
  Production,
  Recipe,
} from "@/lib/shop/types";

import { EMPTY_FORM_STATE } from "../form-state";
import { Alert, FIELD, SubmitButton } from "../form-ui";
import { bake, saveRecipeForm } from "./actions";

/** Mirrors `consumptionFor` on the server so the preview matches the commit. */
function consumptionFor(
  perBatch: number,
  quantity: number,
  batchYield: number,
): number {
  return Math.round((perBatch * quantity) / batchYield);
}

// --- Record a bake ----------------------------------------------------------

function BakePanel({
  items,
  recipes,
  materials,
}: {
  items: MenuItem[];
  recipes: Recipe[];
  materials: Material[];
}) {
  const [state, submit] = useActionState(bake, EMPTY_FORM_STATE);

  const withRecipes = useMemo(() => {
    const ids = new Set(recipes.map((recipe) => recipe.menuItemId));
    return items.filter((item) => ids.has(item.id));
  }, [items, recipes]);

  const [menuItemId, setMenuItemId] = useState(withRecipes[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");

  const materialsById = useMemo(
    () => new Map(materials.map((material) => [material.id, material])),
    [materials],
  );
  const recipe = recipes.find((candidate) => candidate.menuItemId === menuItemId);

  // Recomputed on every keystroke so the cashier sees the shortfall before
  // committing, not as a rejection afterwards.
  const preview = useMemo(() => {
    const count = Number(quantity);
    if (!recipe || !Number.isInteger(count) || count <= 0) return null;

    return recipe.lines.map((line) => {
      const material = materialsById.get(line.materialId);
      const needed = consumptionFor(line.quantity, count, recipe.batchYield);
      return {
        materialId: line.materialId,
        name: material?.name ?? "Unknown material",
        unit: material?.unit ?? "unit",
        needed,
        have: material?.stock ?? 0,
        cost: material
          ? valueOf(needed, material.stockValue, material.stock)
          : 0,
        short: !material || needed > material.stock,
      };
    });
  }, [materialsById, quantity, recipe]);

  const totalCost = preview?.reduce((sum, line) => sum + line.cost, 0) ?? 0;
  const blocked = preview?.some((line) => line.short) ?? false;

  if (withRecipes.length === 0) {
    return (
      <section
        aria-label="Record a bake"
        className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4"
      >
        <h2 className="text-sm font-semibold tracking-wide">Record a bake</h2>
        <p className="py-8 text-center text-sm text-muted">
          No item has a recipe yet. Add one below and it will appear here.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Record a bake"
      className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4"
    >
      <h2 className="text-sm font-semibold tracking-wide">Record a bake</h2>

      <form action={submit} className="mt-3 flex flex-wrap items-center gap-2">
        <select
          name="menuItemId"
          value={menuItemId}
          onChange={(event) => setMenuItemId(event.target.value)}
          aria-label="What was baked"
          className={`${FIELD} min-w-0 flex-[2]`}
        >
          {withRecipes.map((item) => (
            <option key={item.id} value={item.id} className="bg-background">
              {item.name}
            </option>
          ))}
        </select>
        <input
          name="quantity"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          placeholder="How many"
          inputMode="numeric"
          aria-label="Units produced"
          className={`${FIELD} min-w-0 flex-1 text-right tabular-nums`}
        />
        <SubmitButton variant="primary" size="auto">
          Record
        </SubmitButton>
      </form>

      <Alert message={state.error} />

      {preview && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <p className="text-[0.65rem] tracking-wider text-muted/70 uppercase">
            This will consume
          </p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {preview.map((line) => (
              <li
                key={line.materialId}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="min-w-0 truncate">{line.name}</span>
                <span
                  className={`shrink-0 tabular-nums ${
                    line.short ? "text-red-300" : "text-muted"
                  }`}
                >
                  {formatQuantity(line.needed, line.unit)}
                  {line.short &&
                    ` — only ${formatQuantity(line.have, line.unit)} left`}
                </span>
                <span className="w-20 shrink-0 text-right tabular-nums">
                  {formatMoney(line.cost)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-baseline justify-between border-t border-white/10 pt-2 text-sm font-semibold">
            <span>Ingredient cost</span>
            <span className="tabular-nums text-accent">
              {formatMoney(totalCost)}
            </span>
          </div>
          {blocked && (
            <p className="mt-2 text-xs text-red-300">
              Not enough stock — receive more before recording this bake.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// --- Recipes ----------------------------------------------------------------

/** Blank rows appended so ingredients can be added without a separate control. */
const SPARE_ROWS = 3;

function RecipeLineRow({
  materials,
  materialId = "",
  quantity = "",
  entryUnit,
  index,
}: {
  materials: Material[];
  materialId?: string;
  quantity?: string;
  entryUnit?: string;
  index: number;
}) {
  const selected = materials.find((material) => material.id === materialId);
  const options = ENTRY_UNITS[selected?.unit ?? "g"];

  return (
    <div className="flex items-center gap-2">
      <select
        name="materialId"
        defaultValue={materialId}
        aria-label={`Ingredient ${index + 1}`}
        className={`${FIELD} min-w-0 flex-[2]`}
      >
        <option value="" className="bg-background">
          —
        </option>
        {materials.map((material) => (
          <option key={material.id} value={material.id} className="bg-background">
            {material.name}
          </option>
        ))}
      </select>
      <input
        name="lineQuantity"
        defaultValue={quantity}
        placeholder="Per batch"
        inputMode="decimal"
        aria-label={`Quantity for ingredient ${index + 1}`}
        className={`${FIELD} min-w-0 flex-1 text-right tabular-nums`}
      />
      <select
        name="lineEntryUnit"
        defaultValue={entryUnit ?? options[0].label}
        aria-label={`Unit for ingredient ${index + 1}`}
        className={`${FIELD} w-16 shrink-0`}
      >
        {/* Every unit label, because changing the material changes which are
            valid and this stays a plain uncontrolled form. The server validates
            the pair against the material's own unit. */}
        {[...new Set(Object.values(ENTRY_UNITS).flat().map((o) => o.label))].map(
          (label) => (
            <option key={label} value={label} className="bg-background">
              {label}
            </option>
          ),
        )}
      </select>
    </div>
  );
}

function RecipeCard({
  item,
  recipe,
  materials,
}: {
  item: MenuItem;
  recipe?: Recipe;
  materials: Material[];
}) {
  const [state, submit] = useActionState(saveRecipeForm, EMPTY_FORM_STATE);

  const lines = recipe?.lines ?? [];
  const spares = Array.from({ length: SPARE_ROWS }, (_, index) => index);

  return (
    <details className="border-t border-white/[0.06]">
      <summary className="flex cursor-pointer list-none items-center gap-3 py-3 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
        <span className="shrink-0 text-xs text-muted">
          {recipe
            ? `${recipe.lines.length} ingredient${recipe.lines.length === 1 ? "" : "s"} · yields ${recipe.batchYield}`
            : "No recipe"}
        </span>
      </summary>

      <form action={submit} className="space-y-2 pb-4">
        <input type="hidden" name="menuItemId" value={item.id} />

        <label className="flex items-center gap-2 text-xs text-muted">
          One batch yields
          <input
            name="batchYield"
            defaultValue={recipe?.batchYield ?? 1}
            inputMode="numeric"
            aria-label={`Units one batch of ${item.name} yields`}
            className={`${FIELD} w-20 text-right tabular-nums`}
          />
          units
        </label>

        {lines.map((line, index) => {
          const material = materials.find(
            (candidate) => candidate.id === line.materialId,
          );
          const options = ENTRY_UNITS[material?.unit ?? "g"];
          // Show the stored amount in the largest unit that keeps it whole.
          const largest = options[options.length - 1];
          const useLargest = line.quantity % largest.factor === 0;

          return (
            <RecipeLineRow
              key={line.materialId}
              index={index}
              materials={materials}
              materialId={line.materialId}
              quantity={String(
                useLargest ? line.quantity / largest.factor : line.quantity,
              )}
              entryUnit={useLargest ? largest.label : options[0].label}
            />
          );
        })}

        {spares.map((offset) => (
          <RecipeLineRow
            key={`spare-${offset}`}
            index={lines.length + offset}
            materials={materials}
          />
        ))}

        <div className="flex items-center gap-3 pt-1">
          <SubmitButton variant="primary" size="auto">
            Save recipe
          </SubmitButton>
          <span className="text-[0.7rem] text-muted/70">
            Clear a quantity to drop that ingredient. Clearing them all removes
            the recipe.
          </span>
        </div>
      </form>

      <Alert message={state.error} />
    </details>
  );
}

function ProductionLog({ productions }: { productions: Production[] }) {
  return (
    <section
      aria-label="Recent bakes"
      className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03]"
    >
      <h2 className="border-b border-white/10 px-5 py-3 text-sm font-semibold tracking-wide">
        Recent bakes
      </h2>
      {productions.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">
          Nothing baked yet.
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06] px-5">
          {productions.map((production) => (
            <li key={production.id} className="py-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-medium">
                  {production.quantity} × {production.itemName}
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {production.businessDate} {formatIstTime(production.producedAtMs)}
                </span>
                <span className="shrink-0 tabular-nums text-accent">
                  {formatMoney(production.totalCost)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">
                {production.lines
                  .map(
                    (line) => `${formatQuantity(line.quantity, line.unit)} ${line.name}`,
                  )
                  .join(", ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ProductionScreen({
  items,
  recipes,
  materials,
  productions,
}: {
  items: MenuItem[];
  recipes: Recipe[];
  materials: Material[];
  productions: Production[];
}) {
  const recipesByItem = useMemo(
    () => new Map(recipes.map((recipe) => [recipe.menuItemId, recipe])),
    [recipes],
  );

  return (
    <div className="flex flex-col gap-6 px-4 pb-8 sm:px-6">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <BakePanel items={items} recipes={recipes} materials={materials} />
        <ProductionLog productions={productions} />
      </div>

      <section
        aria-label="Recipes"
        className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4"
      >
        <h2 className="text-sm font-semibold tracking-wide">Recipes</h2>
        {materials.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            Add raw materials on the{" "}
            <a className="text-accent underline" href="/pos/inventory">
              inventory screen
            </a>{" "}
            before writing recipes.
          </p>
        ) : (
          <div className="mt-2">
            {items.map((item) => (
              <RecipeCard
                key={item.id}
                item={item}
                recipe={recipesByItem.get(item.id)}
                materials={materials}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
