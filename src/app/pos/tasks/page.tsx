import { requirePosUser } from "@/lib/auth/session";
import { businessDate } from "@/lib/shop/dates";
import { getTasks } from "@/lib/shop/tasks";
import { isOverdue } from "@/lib/shop/types";

import PosHeader from "../header";
import TaskBoard from "./board";

export default async function TasksPage() {
  const user = await requirePosUser();
  const tasks = await getTasks();

  // Worked out here rather than in the browser: a tablet left on the wrong
  // timezone would otherwise flag the shop's work overdue a day early.
  const today = businessDate();
  const overdue = tasks.filter((task) => isOverdue(task, today)).length;
  const open = tasks.filter((task) => task.status !== "done").length;

  return (
    <div className="flex flex-1 flex-col">
      <PosHeader
        user={user}
        current="/pos/tasks"
        subtitle={
          overdue > 0
            ? `Board · ${open} open · ${overdue} overdue`
            : `Board · ${open} open`
        }
      />
      <TaskBoard tasks={tasks} today={today} />
    </div>
  );
}
