"use client";

import { startTransition, useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { formatBusinessDate } from "@/lib/shop/dates";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  isOverdue,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/shop/types";

import { EMPTY_FORM_STATE } from "../form-state";
import { Alert, FIELD, SubmitButton } from "../form-ui";
import { addTask, clearDone, removeTask, repositionTask, saveTask } from "./actions";

/** Where a dragged card would land: before `beforeId`, or at the column's foot. */
type DropTarget = { status: TaskStatus; beforeId: string | null };

/**
 * The position a drop means, counted with the dragged card taken out.
 *
 * The server splices into exactly this list, so working it out here keeps the
 * two sides agreeing about what "third from the top" means when the card being
 * moved was already second.
 */
function dropIndex(column: Task[], beforeId: string | null, draggedId: string) {
  const without = column.filter((task) => task.id !== draggedId);
  if (beforeId === null) return without.length;

  // Hovering the top half of the card being dragged means "before itself",
  // which is where it already is. Looking that id up in a list it was just
  // removed from would miss and send it to the foot of the column instead.
  if (beforeId === draggedId) {
    const original = column.findIndex((task) => task.id === draggedId);
    return original === -1 ? without.length : original;
  }

  const at = without.findIndex((task) => task.id === beforeId);
  return at === -1 ? without.length : at;
}

const PRIORITY_CHIP: Record<TaskPriority, string | null> = {
  // Normal is the majority of a board and says nothing worth a chip.
  normal: null,
  high: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  low: "border-white/10 text-muted/70",
};

function Chip({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 text-[0.6rem] font-medium ${className}`}
    >
      {children}
    </span>
  );
}

/** A move button that reports its own form's pending state. */
function MoveButton({
  children,
  label,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-label={label}
      title={label}
      className="shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-xs text-muted transition-colors hover:border-white/25 hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
    >
      {children}
    </button>
  );
}

function MoveForm({
  taskId,
  status,
  index,
  label,
  disabled,
  action,
  children,
}: {
  taskId: string;
  status: TaskStatus;
  index: number;
  label: string;
  disabled?: boolean;
  action: (formData: FormData) => void;
  children: React.ReactNode;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={taskId} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="index" value={index} />
      <MoveButton label={label} disabled={disabled}>
        {children}
      </MoveButton>
    </form>
  );
}

/** The fields shared by the editor and — minus the title — nothing else. */
function DetailFields({ task }: { task: Task }) {
  return (
    <>
      <input
        name="title"
        defaultValue={task.title}
        aria-label="Title"
        className={`${FIELD} w-full`}
      />
      <textarea
        name="notes"
        defaultValue={task.notes ?? ""}
        rows={2}
        placeholder="Notes…"
        aria-label="Notes"
        className={`${FIELD} w-full resize-y`}
      />
      <div className="flex flex-wrap gap-1.5">
        <select
          name="priority"
          defaultValue={task.priority}
          aria-label="Priority"
          className={`${FIELD} min-w-0 flex-1`}
        >
          {TASK_PRIORITIES.map((priority) => (
            <option key={priority} value={priority} className="bg-background">
              {TASK_PRIORITY_LABELS[priority]}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="dueDate"
          defaultValue={task.dueDate ?? ""}
          aria-label="Due date"
          className={`${FIELD} min-w-0 flex-1`}
        />
      </div>
      <input
        name="assignee"
        defaultValue={task.assignee ?? ""}
        placeholder="Who is on it…"
        aria-label="Assignee"
        className={`${FIELD} w-full`}
      />
    </>
  );
}

function Editor({
  task,
  position,
  columnSize,
  reposition,
  onClose,
}: {
  task: Task;
  position: number;
  columnSize: number;
  reposition: (formData: FormData) => void;
  onClose: () => void;
}) {
  const [saveState, save] = useActionState(saveTask, EMPTY_FORM_STATE);
  const [deleteState, remove] = useActionState(removeTask, EMPTY_FORM_STATE);

  return (
    <div className="space-y-1.5 border-t border-white/[0.06] px-2.5 py-2.5">
      <form action={save} className="space-y-1.5">
        <input type="hidden" name="id" value={task.id} />
        <DetailFields task={task} />
        <div className="flex items-center gap-1.5">
          <SubmitButton variant="primary" size="auto">
            Save
          </SubmitButton>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted transition-colors hover:border-white/20 hover:text-foreground"
          >
            Close
          </button>
          <span className="flex-1" />
          {/* Ordering by hand, for the counter tablet where nothing can be
              dragged and for anyone working the board from the keyboard. */}
          <MoveForm
            taskId={task.id}
            status={task.status}
            index={position - 1}
            label="Move up"
            disabled={position === 0}
            action={reposition}
          >
            ↑
          </MoveForm>
          <MoveForm
            taskId={task.id}
            status={task.status}
            index={position + 1}
            label="Move down"
            disabled={position >= columnSize - 1}
            action={reposition}
          >
            ↓
          </MoveForm>
        </div>
      </form>

      <form action={remove}>
        <input type="hidden" name="id" value={task.id} />
        <SubmitButton variant="danger" size="auto" label={`Delete ${task.title}`}>
          Delete card
        </SubmitButton>
      </form>

      <Alert message={saveState.error ?? deleteState.error} />

      <p className="text-[0.65rem] text-muted/60">
        Added by {task.createdBy.name ?? (task.createdBy.email || "someone")}
        {task.completedAtMs !== null && " · finished"}
      </p>
    </div>
  );
}

function Card({
  task,
  today,
  position,
  columnSize,
  columnSizes,
  dragging,
  dropTarget,
  reposition,
  onDragStart,
  onDragEnd,
  onDragOverCard,
  onDrop,
}: {
  task: Task;
  today: string;
  position: number;
  columnSize: number;
  columnSizes: Record<TaskStatus, number>;
  dragging: string | null;
  dropTarget: DropTarget | null;
  reposition: (formData: FormData) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOverCard: (event: React.DragEvent, status: TaskStatus, position: number) => void;
  onDrop: (event: React.DragEvent) => void;
}) {
  const [open, setOpen] = useState(false);

  const overdue = isOverdue(task, today);
  const priorityChip = PRIORITY_CHIP[task.priority];
  const index = TASK_STATUSES.indexOf(task.status);
  const previous = TASK_STATUSES[index - 1];
  const next = TASK_STATUSES[index + 1];

  const showLine =
    dropTarget !== null &&
    dropTarget.status === task.status &&
    dropTarget.beforeId === task.id;

  return (
    <li
      onDragOver={(event) => onDragOverCard(event, task.status, position)}
      onDrop={onDrop}
      className={dragging === task.id ? "opacity-40" : undefined}
    >
      <div
        aria-hidden
        className={`mb-1.5 h-0.5 rounded-full transition-colors ${
          showLine ? "bg-accent" : "bg-transparent"
        }`}
      />
      <div
        // An open card is being typed into, not moved: a draggable ancestor
        // makes selecting text inside its inputs almost impossible in Chrome.
        draggable={!open}
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", task.id);
          event.dataTransfer.effectAllowed = "move";
          onDragStart(task.id);
        }}
        onDragEnd={onDragEnd}
        className={`rounded-xl border bg-white/[0.03] transition-colors ${
          overdue ? "border-red-500/30" : "border-white/10"
        } ${open ? "" : "cursor-grab active:cursor-grabbing"}`}
      >
        <div className="flex items-start gap-1 px-2.5 py-2">
          <button
            type="button"
            onClick={() => setOpen((wasOpen) => !wasOpen)}
            aria-expanded={open}
            className="min-w-0 flex-1 text-left"
          >
            <p className="text-sm leading-snug break-words">{task.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {priorityChip && (
                <Chip className={priorityChip}>
                  {TASK_PRIORITY_LABELS[task.priority]}
                </Chip>
              )}
              {task.dueDate && (
                <Chip
                  className={
                    overdue
                      ? "border-red-500/40 bg-red-500/10 text-red-300"
                      : "border-white/10 text-muted"
                  }
                >
                  {overdue ? "Overdue " : "Due "}
                  {formatBusinessDate(task.dueDate)}
                </Chip>
              )}
              {task.assignee && (
                <span className="truncate text-[0.65rem] text-muted">
                  {task.assignee}
                </span>
              )}
            </div>
          </button>

          <div className="flex shrink-0 gap-1">
            {previous && (
              <MoveForm
                taskId={task.id}
                status={previous}
                index={columnSizes[previous]}
                label={`Move to ${TASK_STATUS_LABELS[previous]}`}
                action={reposition}
              >
                ←
              </MoveForm>
            )}
            {next && (
              <MoveForm
                taskId={task.id}
                status={next}
                index={columnSizes[next]}
                label={`Move to ${TASK_STATUS_LABELS[next]}`}
                action={reposition}
              >
                →
              </MoveForm>
            )}
          </div>
        </div>

        {open && (
          <Editor
            task={task}
            position={position}
            columnSize={columnSize}
            reposition={reposition}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    </li>
  );
}

function NewCardForm({ status }: { status: TaskStatus }) {
  const [state, submit] = useActionState(addTask, EMPTY_FORM_STATE);

  return (
    <>
      <form action={submit} className="mt-2 flex gap-1.5">
        <input type="hidden" name="status" value={status} />
        <input type="hidden" name="priority" value="normal" />
        <input
          name="title"
          placeholder="New card…"
          aria-label={`New card in ${TASK_STATUS_LABELS[status]}`}
          className={`${FIELD} min-w-0 flex-1`}
        />
        <SubmitButton variant="primary" size="auto">
          Add
        </SubmitButton>
      </form>
      <Alert message={state.error} />
    </>
  );
}

function ClearDoneForm() {
  return (
    <form action={clearDone}>
      <SubmitButton variant="danger" size="auto" label="Clear the done column">
        Clear
      </SubmitButton>
    </form>
  );
}

export default function TaskBoard({
  tasks,
  today,
}: {
  tasks: Task[];
  today: string;
}) {
  const [moveState, reposition, moving] = useActionState(
    repositionTask,
    EMPTY_FORM_STATE,
  );
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const columns = TASK_STATUSES.map((status) => ({
    status,
    cards: tasks.filter((task) => task.status === status),
  }));
  const columnSizes = Object.fromEntries(
    columns.map(({ status, cards }) => [status, cards.length]),
  ) as Record<TaskStatus, number>;

  function cardsIn(status: TaskStatus): Task[] {
    return columns.find((column) => column.status === status)?.cards ?? [];
  }

  function aim(status: TaskStatus, beforeId: string | null) {
    // dragover fires many times a second; only re-render when the line actually
    // has somewhere new to go.
    setDropTarget((current) =>
      current && current.status === status && current.beforeId === beforeId
        ? current
        : { status, beforeId },
    );
  }

  function onDragOverCard(
    event: React.DragEvent,
    status: TaskStatus,
    position: number,
  ) {
    event.preventDefault();
    event.stopPropagation();

    const cards = cardsIn(status);
    const box = event.currentTarget.getBoundingClientRect();
    // Past a card's midpoint means below it, which is the card after's "before".
    const below = event.clientY > box.top + box.height / 2;
    aim(status, below ? (cards[position + 1]?.id ?? null) : cards[position].id);
  }

  function onDragOverColumn(event: React.DragEvent, status: TaskStatus) {
    event.preventDefault();
    aim(status, null);
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();

    const id = dragging ?? event.dataTransfer.getData("text/plain");
    const target = dropTarget;
    setDragging(null);
    setDropTarget(null);
    if (!id || !target) return;

    const data = new FormData();
    data.set("id", id);
    data.set("status", target.status);
    data.set(
      "index",
      String(dropIndex(cardsIn(target.status), target.beforeId, id)),
    );
    startTransition(() => reposition(data));
  }

  function onDragEnd() {
    setDragging(null);
    setDropTarget(null);
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-8 sm:px-6">
      <Alert message={moveState.error} />

      <div
        className={`grid items-start gap-4 md:grid-cols-3 ${
          moving ? "opacity-60 transition-opacity" : ""
        }`}
      >
        {columns.map(({ status, cards }) => (
          <section
            key={status}
            aria-label={TASK_STATUS_LABELS[status]}
            onDragOver={(event) => onDragOverColumn(event, status)}
            onDrop={onDrop}
            className={`min-w-0 rounded-2xl border bg-white/[0.03] px-3 py-3 transition-colors ${
              dropTarget?.status === status
                ? "border-accent/40"
                : "border-white/10"
            }`}
          >
            <div className="flex items-center justify-between gap-2 px-0.5 pb-2">
              <h2 className="text-sm font-semibold tracking-wide">
                {TASK_STATUS_LABELS[status]}
                <span className="ml-2 text-xs font-normal text-muted tabular-nums">
                  {cards.length}
                </span>
              </h2>
              {status === "done" && cards.length > 0 && <ClearDoneForm />}
            </div>

            <ul className="min-h-16">
              {cards.map((task, position) => (
                <Card
                  key={task.id}
                  task={task}
                  today={today}
                  position={position}
                  columnSize={cards.length}
                  columnSizes={columnSizes}
                  dragging={dragging}
                  dropTarget={dropTarget}
                  reposition={reposition}
                  onDragStart={setDragging}
                  onDragEnd={onDragEnd}
                  onDragOverCard={onDragOverCard}
                  onDrop={onDrop}
                />
              ))}
              <li aria-hidden>
                <div
                  className={`h-0.5 rounded-full transition-colors ${
                    dropTarget?.status === status && dropTarget.beforeId === null
                      ? "bg-accent"
                      : "bg-transparent"
                  }`}
                />
              </li>
            </ul>

            {cards.length === 0 && (
              <p className="px-0.5 py-3 text-xs text-muted/70">
                {status === "todo"
                  ? "Nothing waiting."
                  : status === "doing"
                    ? "Nothing on the go."
                    : "Nothing finished yet."}
              </p>
            )}

            <NewCardForm status={status} />
          </section>
        ))}
      </div>

      <p className="text-[0.7rem] text-muted/70">
        Drag a card between columns, or use the arrows — they do the same thing,
        and the arrows keep working on the counter tablet, where nothing can be
        dragged. Open a card to set a due date, a priority and who is on it.
        Finished cards stay until someone clears them.
      </p>
    </div>
  );
}
