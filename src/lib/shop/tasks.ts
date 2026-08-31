import "server-only";

import {
  FieldValue,
  Timestamp,
  type DocumentSnapshot,
} from "firebase-admin/firestore";

import { COLLECTIONS, getDb } from "@/lib/firebase/admin";

import { isBusinessDate } from "./dates";
import {
  isTaskPriority,
  isTaskStatus,
  type Task,
  type TaskStatus,
} from "./types";

export type Actor = { email: string; name: string | null };

export type TaskResult = { ok: true } | { ok: false; error: string };

/**
 * The board's storage.
 *
 * Cards are positioned by an integer `sortOrder` that is unique only within a
 * column, and every move rewrites the whole target column to contiguous
 * multiples of `ORDER_STEP`. Fractional midpoints would avoid those extra
 * writes, but they halve on every insert at the same spot and a board that has
 * been tidied often enough eventually runs out of float precision. A shop's
 * board holds tens of cards, not thousands — rewriting a column is a handful of
 * writes and it can never drift.
 */
const ORDER_STEP = 10;

/** Cards a column may hold. A board past this is a list, and needs a list. */
export const MAX_TASKS = 300;

function readTask(doc: DocumentSnapshot): Task | null {
  const data = doc.data();
  if (!data) return null;

  const { title } = data;
  if (typeof title !== "string" || title.trim() === "") return null;

  const createdAt = data.createdAt;
  const completedAt = data.completedAt;

  return {
    id: doc.id,
    title,
    notes: typeof data.notes === "string" && data.notes !== "" ? data.notes : null,
    // A status typed by hand in the Firebase console must not create a fourth
    // column that nothing on screen can reach, so anything unknown lands back
    // in the first one.
    status: isTaskStatus(data.status) ? data.status : "todo",
    priority: isTaskPriority(data.priority) ? data.priority : "normal",
    assignee:
      typeof data.assignee === "string" && data.assignee !== ""
        ? data.assignee
        : null,
    dueDate: isBusinessDate(data.dueDate) ? data.dueDate : null,
    sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0,
    createdAtMs: createdAt instanceof Timestamp ? createdAt.toMillis() : 0,
    createdBy: {
      email: String(data.createdBy?.email ?? ""),
      name: data.createdBy?.name ?? null,
    },
    completedAtMs:
      completedAt instanceof Timestamp ? completedAt.toMillis() : null,
  };
}

/**
 * Every card, ordered as the board draws them.
 *
 * One unfiltered read rather than a query per column: three queries would each
 * need their own index and would still have to be stitched back together here.
 */
export async function getTasks(): Promise<Task[]> {
  const snapshot = await getDb()
    .collection(COLLECTIONS.tasks)
    .limit(MAX_TASKS)
    .get();

  return snapshot.docs
    .map(readTask)
    .filter((task): task is Task => task !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAtMs - b.createdAtMs);
}

export type TaskInput = {
  title: string;
  notes: string | null;
  priority: Task["priority"];
  assignee: string | null;
  dueDate: string | null;
};

export async function createTask(
  input: TaskInput,
  status: TaskStatus,
  actor: Actor,
): Promise<TaskResult> {
  const db = getDb();

  const existing = await getTasks();
  if (existing.length >= MAX_TASKS) {
    return {
      ok: false,
      error: `The board is full at ${MAX_TASKS} cards. Clear the done column first.`,
    };
  }

  // Appended to the foot of its column: a card someone has just typed has no
  // claim to be more urgent than the ones already waiting.
  const last = existing
    .filter((task) => task.status === status)
    .reduce((max, task) => Math.max(max, task.sortOrder), 0);

  await db.collection(COLLECTIONS.tasks).add({
    ...input,
    status,
    sortOrder: last + ORDER_STEP,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actor,
    completedAt: status === "done" ? Timestamp.now() : null,
  });

  return { ok: true };
}

/** The card's own fields. Status and position move only through `moveTask`. */
export async function updateTask(
  id: string,
  input: TaskInput,
): Promise<TaskResult> {
  const doc = getDb().collection(COLLECTIONS.tasks).doc(id);

  const snapshot = await doc.get();
  if (!snapshot.exists) return { ok: false, error: "That card no longer exists." };

  await doc.update({ ...input, updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
}

export async function deleteTask(id: string): Promise<TaskResult> {
  await getDb().collection(COLLECTIONS.tasks).doc(id).delete();
  return { ok: true };
}

/**
 * Moves a card to `index` within `status`, renumbering that column.
 *
 * `index` counts positions in the destination column *with the moved card taken
 * out*, which is what the board computes when you drop a card onto another one.
 * It is clamped rather than rejected: a drop that raced a colleague's move
 * should land at the end of the column, not throw the card away.
 */
export async function moveTask(
  id: string,
  status: TaskStatus,
  index: number,
  actor: Actor,
): Promise<TaskResult> {
  const db = getDb();
  const tasks = await getTasks();

  const moved = tasks.find((task) => task.id === id);
  if (!moved) return { ok: false, error: "That card no longer exists." };

  const column = tasks.filter(
    (task) => task.status === status && task.id !== moved.id,
  );
  const at = Math.min(
    Math.max(Number.isInteger(index) ? index : column.length, 0),
    column.length,
  );
  column.splice(at, 0, moved);

  const batch = db.batch();

  column.forEach((task, position) => {
    const sortOrder = (position + 1) * ORDER_STEP;
    const ref = db.collection(COLLECTIONS.tasks).doc(task.id);

    if (task.id !== moved.id) {
      // Neighbours only shift when they actually have to; a drop at the foot of
      // a column should not rewrite every card above it.
      if (task.sortOrder !== sortOrder) batch.update(ref, { sortOrder });
      return;
    }

    batch.update(ref, {
      status,
      sortOrder,
      // Reordering within the done column must not restamp when the work
      // finished, so the timestamp only moves when the column does.
      ...(status === "done" && moved.status !== "done"
        ? { completedAt: Timestamp.now() }
        : {}),
      ...(status !== "done" && moved.status === "done"
        ? { completedAt: null }
        : {}),
      movedAt: FieldValue.serverTimestamp(),
      movedBy: actor,
    });
  });

  await batch.commit();
  return { ok: true };
}

/**
 * Empties the done column.
 *
 * The board is the only screen here with no archive behind it — a finished
 * chore is not a business record the way a sale or a stock movement is, and
 * keeping every one of them forever would slowly turn the board into a log.
 */
export async function clearDoneTasks(): Promise<number> {
  const db = getDb();
  const done = (await getTasks()).filter((task) => task.status === "done");
  if (done.length === 0) return 0;

  const batch = db.batch();
  for (const task of done) {
    batch.delete(db.collection(COLLECTIONS.tasks).doc(task.id));
  }
  await batch.commit();

  return done.length;
}
