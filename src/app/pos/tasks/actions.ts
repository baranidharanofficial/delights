"use server";

import { revalidatePath } from "next/cache";

import { requirePosUser } from "@/lib/auth/session";
import { isBusinessDate } from "@/lib/shop/dates";
import {
  clearDoneTasks,
  createTask,
  deleteTask,
  moveTask,
  updateTask,
  type Actor,
  type TaskInput,
} from "@/lib/shop/tasks";
import { isTaskPriority, isTaskStatus } from "@/lib/shop/types";

import { EMPTY_FORM_STATE, type FormState } from "../form-state";

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

async function actor(): Promise<Actor> {
  const user = await requirePosUser();
  return { email: user.email, name: user.name };
}

/**
 * The card's own fields, as typed.
 *
 * Returns the error rather than throwing so both the add and the edit form can
 * report it in their own `Alert` — a board full of cards should never lose one
 * form's complaint to another form's.
 */
function readInput(formData: FormData): TaskInput | { error: string } {
  const title = text(formData, "title");
  if (title === "") return { error: "Give the card a title." };

  const priority = text(formData, "priority");
  if (!isTaskPriority(priority)) return { error: "Pick a priority." };

  const dueDate = text(formData, "dueDate");
  if (dueDate !== "" && !isBusinessDate(dueDate)) {
    return { error: "The due date must be a real date, or blank." };
  }

  return {
    title,
    notes: text(formData, "notes") || null,
    priority,
    assignee: text(formData, "assignee") || null,
    dueDate: dueDate || null,
  };
}

export async function addTask(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const who = await actor();

  const status = text(formData, "status");
  if (!isTaskStatus(status)) return { error: "Unrecognised column." };

  const input = readInput(formData);
  if ("error" in input) return input;

  const result = await createTask(input, status, who);
  if (!result.ok) return { error: result.error };

  revalidatePath("/pos/tasks");
  return EMPTY_FORM_STATE;
}

export async function saveTask(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePosUser();

  const id = text(formData, "id");
  if (id === "") return { error: "Nothing to save." };

  const input = readInput(formData);
  if ("error" in input) return input;

  const result = await updateTask(id, input);
  if (!result.ok) return { error: result.error };

  revalidatePath("/pos/tasks");
  return EMPTY_FORM_STATE;
}

export async function removeTask(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePosUser();

  const id = text(formData, "id");
  if (id === "") return { error: "Nothing to delete." };

  await deleteTask(id);

  revalidatePath("/pos/tasks");
  return EMPTY_FORM_STATE;
}

/**
 * Where a card ended up — from a drag, or from the arrow buttons beside it.
 *
 * Both go through one action so the board has a single pending state to grey
 * out on, and so the touch path and the mouse path can never disagree about
 * what a move means.
 */
export async function repositionTask(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const who = await actor();

  const id = text(formData, "id");
  if (id === "") return { error: "Nothing to move." };

  const status = text(formData, "status");
  if (!isTaskStatus(status)) return { error: "Unrecognised column." };

  const index = Number(text(formData, "index"));
  const result = await moveTask(id, status, index, who);
  if (!result.ok) return { error: result.error };

  revalidatePath("/pos/tasks");
  return EMPTY_FORM_STATE;
}

/**
 * Empties the done column.
 *
 * Takes no state: the button only exists when there is something to clear, so
 * there is no failure worth reporting back into a form.
 */
export async function clearDone(): Promise<void> {
  await requirePosUser();

  await clearDoneTasks();
  revalidatePath("/pos/tasks");
}
