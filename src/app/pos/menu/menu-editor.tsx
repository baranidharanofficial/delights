"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { toRupeeInput } from "@/lib/shop/money";
import type { Category, MenuItem } from "@/lib/shop/types";

import {
  removeCategory,
  removeMenuItem,
  saveCategory,
  saveMenuItem,
} from "./actions";
import { EMPTY_FORM_STATE } from "./form-state";

const FIELD =
  "rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm placeholder:text-muted/60 focus:border-accent/40 focus:outline-none";

function SubmitButton({
  children,
  variant = "quiet",
  label,
}: {
  children: React.ReactNode;
  variant?: "quiet" | "primary" | "danger";
  label?: string;
}) {
  const { pending } = useFormStatus();
  const styles = {
    quiet: "border-white/10 text-muted hover:border-white/20 hover:text-foreground",
    primary: "border-accent/40 bg-accent/15 text-accent hover:bg-accent/25",
    danger: "border-red-500/30 text-red-300/80 hover:border-red-500/60 hover:text-red-300",
  }[variant];

  // Fixed width so Save/Add/✕ occupy identical slots and the column headers
  // above them stay aligned with the fields below.
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      className={`w-14 shrink-0 rounded-lg border py-1.5 text-center text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 ${styles}`}
    >
      {pending ? "…" : children}
    </button>
  );
}

function Alert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
    >
      {message}
    </p>
  );
}

// --- Categories -------------------------------------------------------------

function CategoryRow({ category }: { category: Category }) {
  const [renameState, rename] = useActionState(saveCategory, EMPTY_FORM_STATE);
  const [deleteState, remove] = useActionState(removeCategory, EMPTY_FORM_STATE);

  return (
    <li className="py-2">
      <div className="flex items-center gap-2">
        {/* Two sibling forms rather than one: HTML forms cannot nest, and each
            needs its own action state so the errors do not overwrite each other. */}
        <form action={rename} className="flex min-w-0 flex-1 items-center gap-2">
          <input type="hidden" name="id" value={category.id} />
          <input
            name="name"
            defaultValue={category.name}
            aria-label={`Rename ${category.name}`}
            className={`${FIELD} min-w-0 flex-1`}
          />
          <SubmitButton>Save</SubmitButton>
        </form>
        <form action={remove}>
          <input type="hidden" name="id" value={category.id} />
          <SubmitButton variant="danger" label={`Delete ${category.name}`}>
            ✕
          </SubmitButton>
        </form>
      </div>
      <Alert message={renameState.error ?? deleteState.error} />
    </li>
  );
}

function NewCategoryForm({ nextSortOrder }: { nextSortOrder: number }) {
  const [state, action] = useActionState(saveCategory, EMPTY_FORM_STATE);

  return (
    <>
      <form action={action} className="flex items-center gap-2 pt-3">
        <input type="hidden" name="sortOrder" value={nextSortOrder} />
        <input
          name="name"
          placeholder="New category…"
          aria-label="New category name"
          className={`${FIELD} min-w-0 flex-1`}
        />
        <SubmitButton variant="primary">Add</SubmitButton>
      </form>
      <Alert message={state.error} />
    </>
  );
}

// --- Items ------------------------------------------------------------------

/** The seven aligned field columns shared by the header, each row and the add form. */
function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 flex-1 grid-cols-[repeat(7,minmax(0,1fr))] items-center gap-2">
      {children}
    </div>
  );
}

function ItemFields({
  item,
  categories,
}: {
  item?: MenuItem;
  categories: Category[];
}) {
  return (
    <>
      <input
        name="name"
        defaultValue={item?.name}
        placeholder="Item name"
        aria-label="Item name"
        className={`${FIELD} col-span-2 min-w-0`}
      />
      <input
        name="price"
        defaultValue={item ? toRupeeInput(item.price) : ""}
        placeholder="₹ price"
        inputMode="decimal"
        aria-label="Price in rupees"
        className={`${FIELD} min-w-0 text-right tabular-nums`}
      />
      <select
        name="categoryId"
        defaultValue={item?.categoryId ?? categories[0]?.id}
        aria-label="Category"
        className={`${FIELD} min-w-0`}
      >
        {categories.map((category) => (
          <option key={category.id} value={category.id} className="bg-background">
            {category.name}
          </option>
        ))}
      </select>
      <input
        name="stock"
        defaultValue={item?.stock ?? ""}
        placeholder="—"
        inputMode="numeric"
        aria-label="Stock on hand, blank to stop tracking"
        title="Blank means this item is not stock-tracked"
        className={`${FIELD} min-w-0 text-right tabular-nums`}
      />
      <input
        name="sortOrder"
        defaultValue={item?.sortOrder ?? 0}
        inputMode="numeric"
        aria-label="Sort order"
        className={`${FIELD} min-w-0 text-right tabular-nums`}
      />
      <label className="flex items-center justify-center gap-1.5 text-xs text-muted">
        <input
          type="checkbox"
          name="available"
          defaultChecked={item?.available ?? true}
          className="accent-accent"
        />
        <span className="sr-only sm:not-sr-only">On</span>
      </label>
    </>
  );
}

function ItemRow({
  item,
  categories,
}: {
  item: MenuItem;
  categories: Category[];
}) {
  const [saveState, save] = useActionState(saveMenuItem, EMPTY_FORM_STATE);
  const [deleteState, remove] = useActionState(removeMenuItem, EMPTY_FORM_STATE);

  return (
    <li className="border-t border-white/[0.06] py-2">
      <div className="flex items-center gap-2">
        <form action={save} className="flex min-w-0 flex-1 items-center gap-2">
          <input type="hidden" name="id" value={item.id} />
          <FieldGrid>
            <ItemFields item={item} categories={categories} />
          </FieldGrid>
          <SubmitButton>Save</SubmitButton>
        </form>
        {/* A sibling form, not a nested one: HTML forms cannot nest, and delete
            needs its own action state so the two errors do not overwrite each
            other. */}
        <form action={remove}>
          <input type="hidden" name="id" value={item.id} />
          <SubmitButton variant="danger" label={`Delete ${item.name}`}>
            ✕
          </SubmitButton>
        </form>
      </div>
      <Alert message={saveState.error ?? deleteState.error} />
    </li>
  );
}

function NewItemForm({ categories }: { categories: Category[] }) {
  const [state, action] = useActionState(saveMenuItem, EMPTY_FORM_STATE);

  return (
    <>
      <form action={action} className="flex items-center gap-2">
        <FieldGrid>
          <ItemFields categories={categories} />
        </FieldGrid>
        <SubmitButton variant="primary">Add</SubmitButton>
        {/* Keeps the add row's fields aligned with the rows above, which carry a
            delete button in this slot. */}
        <span aria-hidden className="invisible w-14 shrink-0 py-1.5 text-xs">
          ✕
        </span>
      </form>
      <Alert message={state.error} />
    </>
  );
}

export default function MenuEditor({
  categories,
  items,
}: {
  categories: Category[];
  items: MenuItem[];
}) {
  const nextSortOrder =
    categories.reduce((max, category) => Math.max(max, category.sortOrder), 0) + 10;

  return (
    <div className="grid flex-1 items-start gap-6 px-4 pb-8 sm:px-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <section
        aria-label="Categories"
        className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4"
      >
        <h2 className="text-sm font-semibold tracking-wide">Categories</h2>
        <ul className="mt-2 divide-y divide-white/[0.06]">
          {categories.map((category) => (
            <CategoryRow key={category.id} category={category} />
          ))}
        </ul>
        <NewCategoryForm nextSortOrder={nextSortOrder} />
      </section>

      <section
        aria-label="Menu items"
        className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4"
      >
        <h2 className="text-sm font-semibold tracking-wide">Items</h2>

        {categories.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            Add a category first — every item belongs to one.
          </p>
        ) : (
          <>
            {/* Mirrors a row's flex layout — grid, then the two buttons as
                invisible spacers — so the labels stay over their columns. */}
            <div className="mt-3 flex items-center gap-2 text-[0.65rem] tracking-wider text-muted/70 uppercase">
              <FieldGrid>
                <span className="col-span-2">Name</span>
                <span className="text-right">Price</span>
                <span>Category</span>
                <span className="text-right">Stock</span>
                <span className="text-right">Sort</span>
                <span className="text-center">On</span>
              </FieldGrid>
              <span aria-hidden className="invisible w-14 shrink-0 py-1.5 text-xs">
                Save
              </span>
              <span aria-hidden className="invisible w-14 shrink-0 py-1.5 text-xs">
                ✕
              </span>
            </div>

            <ul className="mt-1">
              {items.map((item) => (
                <ItemRow key={item.id} item={item} categories={categories} />
              ))}
            </ul>

            <div className="mt-4 border-t border-white/10 pt-4">
              <NewItemForm categories={categories} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
