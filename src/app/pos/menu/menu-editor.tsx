"use client";

import { useActionState } from "react";

import { toRupeeInput } from "@/lib/shop/money";
import type { Category, MenuItem } from "@/lib/shop/types";

import {
  removeCategory,
  removeMenuItem,
  saveCategory,
  saveMenuItem,
} from "./actions";
import { EMPTY_FORM_STATE } from "../form-state";
import { Alert, ButtonSpacer, FIELD, SubmitButton } from "../form-ui";
import ImageField from "../image-field";

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
        {/* Outside the save form on purpose — a file input inside it would be
            posted along with every ordinary field edit. */}
        <ImageField
          target="menuItems"
          id={item.id}
          imageKey={item.imageKey}
          label={item.name}
          size={36}
        />
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
        {/* A picture needs a record to hang off, so it is added after saving. */}
        <span
          aria-hidden
          title="Save the item first, then add a picture"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/10 text-[0.6rem] text-muted/40"
        >
          ＋
        </span>
        <FieldGrid>
          <ItemFields categories={categories} />
        </FieldGrid>
        <SubmitButton variant="primary">Add</SubmitButton>
        {/* Keeps the add row's fields aligned with the rows above, which carry a
            delete button in this slot. */}
        <ButtonSpacer />
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
              <span aria-hidden className="w-9 shrink-0" />
              <FieldGrid>
                <span className="col-span-2">Name</span>
                <span className="text-right">Price</span>
                <span>Category</span>
                <span className="text-right">Stock</span>
                <span className="text-right">Sort</span>
                <span className="text-center">On</span>
              </FieldGrid>
              <ButtonSpacer />
              <ButtonSpacer />
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
