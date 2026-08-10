"use client";

import { useActionState } from "react";

import { formatIstTime } from "@/lib/shop/dates";
import { formatMoney } from "@/lib/shop/money";
import {
  ENTRY_UNITS,
  UNITS,
  UNIT_LABELS,
  costUnitLabel,
  formatQuantity,
  unitCost,
  type Unit,
} from "@/lib/shop/units";
import {
  MOVEMENT_LABELS,
  isLowStock,
  type Material,
  type MaterialMovement,
} from "@/lib/shop/types";

import { EMPTY_FORM_STATE } from "../form-state";
import { Alert, FIELD, SubmitButton } from "../form-ui";
import ImageField, { imageSrc } from "../image-field";
import { count, receive, removeMaterial, saveMaterial, waste } from "./actions";

/**
 * Amount plus the unit it was typed in.
 *
 * The server rescales into base units using the material's stored unit, so this
 * select only decides the multiplier — it can never change what the material is
 * measured in.
 */
function QuantityField({
  unit,
  label,
  defaultValue = "",
  placeholder,
}: {
  unit: Unit;
  label: string;
  defaultValue?: string | number;
  placeholder?: string;
}) {
  const options = ENTRY_UNITS[unit];
  // Default to the largest unit — stock arrives in kilos and litres far more
  // often than in grams and millilitres.
  const preferred = options[options.length - 1].label;

  return (
    <span className="flex min-w-0 flex-1 gap-1">
      <input
        name="quantity"
        defaultValue={defaultValue}
        placeholder={placeholder}
        inputMode="decimal"
        aria-label={label}
        className={`${FIELD} w-full min-w-0 text-right tabular-nums`}
      />
      <select
        name="entryUnit"
        defaultValue={preferred}
        aria-label={`${label} unit`}
        className={`${FIELD} shrink-0`}
      >
        {options.map((option) => (
          <option key={option.label} value={option.label} className="bg-background">
            {option.label}
          </option>
        ))}
      </select>
    </span>
  );
}

function OperationForm({
  material,
  action,
  submitLabel,
  variant = "quiet",
  quantityLabel,
  quantityDefault,
  notePlaceholder,
  extra,
}: {
  material: Material;
  action: typeof receive;
  submitLabel: string;
  variant?: "quiet" | "primary" | "danger";
  quantityLabel: string;
  quantityDefault?: string | number;
  notePlaceholder: string;
  extra?: React.ReactNode;
}) {
  const [state, submit] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <div>
      <form action={submit} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={material.id} />
        <span className="w-20 shrink-0 text-xs text-muted">{quantityLabel}</span>
        <QuantityField
          unit={material.unit}
          label={`${quantityLabel} ${material.name}`}
          defaultValue={quantityDefault}
        />
        {extra}
        <input
          name="note"
          placeholder={notePlaceholder}
          aria-label={`${quantityLabel} note`}
          className={`${FIELD} min-w-0 flex-[2]`}
        />
        <SubmitButton variant={variant} size="auto">
          {submitLabel}
        </SubmitButton>
      </form>
      <Alert message={state.error} />
    </div>
  );
}

function SettingsForm({ material }: { material: Material }) {
  const [saveState, save] = useActionState(saveMaterial, EMPTY_FORM_STATE);
  const [deleteState, remove] = useActionState(removeMaterial, EMPTY_FORM_STATE);

  const options = ENTRY_UNITS[material.unit];
  const largest = options[options.length - 1];
  const reorderInLargest =
    material.reorderLevel === null ? "" : material.reorderLevel / largest.factor;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <form action={save} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={material.id} />
          <input type="hidden" name="unit" value={material.unit} />
          <span className="w-20 shrink-0 text-xs text-muted">Settings</span>
          <ImageField
            target="materials"
            id={material.id}
            imageKey={material.imageKey}
            label={material.name}
            size={34}
          />
          <input
            name="name"
            defaultValue={material.name}
            aria-label={`Rename ${material.name}`}
            className={`${FIELD} min-w-0 flex-[2]`}
          />
          <span className="flex min-w-0 flex-1 gap-1">
            <input
              name="reorderLevel"
              defaultValue={reorderInLargest}
              placeholder="Reorder at"
              inputMode="decimal"
              aria-label={`Reorder level for ${material.name}`}
              className={`${FIELD} w-full min-w-0 text-right tabular-nums`}
            />
            <select
              name="reorderEntryUnit"
              defaultValue={largest.label}
              aria-label="Reorder level unit"
              className={`${FIELD} shrink-0`}
            >
              {options.map((option) => (
                <option key={option.label} value={option.label} className="bg-background">
                  {option.label}
                </option>
              ))}
            </select>
          </span>
          <input
            name="sortOrder"
            defaultValue={material.sortOrder}
            inputMode="numeric"
            aria-label="Sort order"
            className={`${FIELD} w-16 shrink-0 text-right tabular-nums`}
          />
          <SubmitButton size="auto">Save</SubmitButton>
        </form>
        <form action={remove}>
          <input type="hidden" name="id" value={material.id} />
          <SubmitButton variant="danger" size="auto" label={`Delete ${material.name}`}>
            Delete
          </SubmitButton>
        </form>
      </div>
      <Alert message={saveState.error ?? deleteState.error} />
      <p className="mt-2 text-[0.7rem] text-muted/70">
        The unit of measure is fixed at creation — changing it would reinterpret
        the balance and every ledger row behind it.
      </p>
    </div>
  );
}

function MaterialRow({ material }: { material: Material }) {
  const low = isLowStock(material);
  const rate = unitCost(material.stockValue, material.stock, material.unit);

  return (
    <li className="border-t border-white/[0.06]">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 py-3 text-sm">
          {material.imageKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageSrc(material.imageKey)}
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0 rounded-md object-cover"
            />
          ) : (
            <span aria-hidden className="size-7 shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate font-medium">
            {material.name}
          </span>
          <span className="w-24 shrink-0 text-right tabular-nums">
            {formatQuantity(material.stock, material.unit)}
          </span>
          <span className="hidden w-28 shrink-0 text-right text-muted tabular-nums sm:inline">
            {rate === null
              ? "—"
              : `${formatMoney(rate)}/${costUnitLabel(material.unit)}`}
          </span>
          <span className="w-24 shrink-0 text-right tabular-nums">
            {formatMoney(material.stockValue)}
          </span>
          <span className="w-16 shrink-0 text-right">
            {low ? (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-medium text-amber-300">
                Low
              </span>
            ) : (
              <span className="text-[0.65rem] text-muted/60">OK</span>
            )}
          </span>
          <span
            aria-hidden
            className="w-4 shrink-0 text-muted transition-transform group-open:rotate-90"
          >
            ›
          </span>
        </summary>

        <div className="space-y-3 pb-4 pl-1">
          <OperationForm
            material={material}
            action={receive}
            submitLabel="Receive"
            variant="primary"
            quantityLabel="Receive"
            notePlaceholder="Supplier, invoice no…"
            extra={
              <input
                name="cost"
                placeholder="₹ total paid"
                inputMode="decimal"
                aria-label={`Total cost of the ${material.name} received`}
                className={`${FIELD} min-w-0 flex-1 text-right tabular-nums`}
              />
            }
          />
          <OperationForm
            material={material}
            action={waste}
            submitLabel="Write off"
            variant="danger"
            quantityLabel="Waste"
            notePlaceholder="Reason (required) — spoiled, spilled…"
          />
          <OperationForm
            material={material}
            action={count}
            submitLabel="Adjust"
            quantityLabel="Counted"
            quantityDefault=""
            notePlaceholder="Who counted, when…"
          />
          <SettingsForm material={material} />
        </div>
      </details>
    </li>
  );
}

function NewMaterialForm({ nextSortOrder }: { nextSortOrder: number }) {
  const [state, action] = useActionState(saveMaterial, EMPTY_FORM_STATE);

  return (
    <>
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="sortOrder" value={nextSortOrder} />
        <input
          name="name"
          placeholder="New material…"
          aria-label="New material name"
          className={`${FIELD} min-w-0 flex-[2]`}
        />
        <select
          name="unit"
          defaultValue="g"
          aria-label="Unit of measure"
          className={`${FIELD} min-w-0 flex-1`}
        >
          {UNITS.map((unit) => (
            <option key={unit} value={unit} className="bg-background">
              {UNIT_LABELS[unit]}
            </option>
          ))}
        </select>
        <SubmitButton variant="primary" size="auto">
          Add
        </SubmitButton>
      </form>
      <Alert message={state.error} />
      <p className="mt-2 text-[0.7rem] text-muted/70">
        New materials start empty. Stock only ever arrives through a receipt, so
        there is always a ledger row behind the balance.
      </p>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="text-[0.65rem] tracking-wider text-muted/70 uppercase">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Ledger({ movements }: { movements: MaterialMovement[] }) {
  return (
    <section
      aria-label="Recent stock movements"
      className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03]"
    >
      <h2 className="border-b border-white/10 px-5 py-3 text-sm font-semibold tracking-wide">
        Recent movements
      </h2>
      {movements.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">
          Nothing recorded yet.
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06] px-5">
          {movements.map((movement) => (
            <li key={movement.id} className="py-2.5 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">{movement.materialName}</span>
                <span
                  className={`shrink-0 tabular-nums ${
                    movement.quantity < 0 ? "text-red-300/80" : "text-accent"
                  }`}
                >
                  {movement.quantity > 0 ? "+" : "−"}
                  {formatQuantity(Math.abs(movement.quantity), movement.unit)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">
                {MOVEMENT_LABELS[movement.kind]} · {movement.businessDate}{" "}
                {formatIstTime(movement.atMs)}
                {movement.note ? ` · ${movement.note}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function InventoryScreen({
  materials,
  movements,
}: {
  materials: Material[];
  movements: MaterialMovement[];
}) {
  const totalValue = materials.reduce(
    (sum, material) => sum + material.stockValue,
    0,
  );
  const lowCount = materials.filter(isLowStock).length;
  const nextSortOrder =
    materials.reduce((max, material) => Math.max(max, material.sortOrder), 0) + 10;

  return (
    <div className="flex flex-col gap-6 px-4 pb-8 sm:px-6">
      <section aria-label="Inventory totals" className="grid grid-cols-3 gap-3">
        <Tile label="Materials" value={String(materials.length)} />
        <Tile label="Stock value" value={formatMoney(totalValue)} />
        <Tile label="Low stock" value={String(lowCount)} />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section
          aria-label="Materials"
          className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4"
        >
          <h2 className="text-sm font-semibold tracking-wide">Raw materials</h2>

          {materials.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              No materials yet. Add flour, butter, cups — whatever you buy in.
            </p>
          ) : (
            <>
              <div className="mt-3 flex items-center gap-3 pr-4 text-[0.65rem] tracking-wider text-muted/70 uppercase">
                <span aria-hidden className="size-7 shrink-0" />
                <span className="min-w-0 flex-1">Material</span>
                <span className="w-24 shrink-0 text-right">On hand</span>
                <span className="hidden w-28 shrink-0 text-right sm:inline">
                  Unit cost
                </span>
                <span className="w-24 shrink-0 text-right">Value</span>
                <span className="w-16 shrink-0 text-right">Status</span>
              </div>
              <ul>
                {materials.map((material) => (
                  <MaterialRow key={material.id} material={material} />
                ))}
              </ul>
            </>
          )}

          <div className="mt-4 border-t border-white/10 pt-4">
            <NewMaterialForm nextSortOrder={nextSortOrder} />
          </div>
        </section>

        <Ledger movements={movements} />
      </div>
    </div>
  );
}
