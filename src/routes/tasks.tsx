import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Plus, Trash2 } from "lucide-react";
import {
  editDay,
  getDay,
  todayKey,
  useAppState,
  type Task,
} from "@/lib/store";
import { Btn, Card, SectionTitle, inputClass, useHydrated } from "@/components/kit";
import { haptic } from "@/lib/alarm";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks & Daily Target — Flow Tracker" },
      {
        name: "description",
        content: "Set your daily work target and manage a prioritised, reorderable task queue.",
      },
      { property: "og:title", content: "Tasks & Daily Target — Flow Tracker" },
      {
        property: "og:description",
        content: "Daily target hours plus a prioritised task queue that rolls over at midnight.",
      },
    ],
  }),
  component: TasksPage,
});

function TasksPage() {
  const state = useAppState();
  const hydrated = useHydrated();
  const [activeDate, setActiveDate] = useState(todayKey());
  const [name, setName] = useState("");

  // auto-roll to the new day at midnight
  useEffect(() => {
    const id = setInterval(() => {
      const t = todayKey();
      setActiveDate((prev) => (prev !== t && prev === yesterdayOf(t) ? t : prev));
    }, 20000);
    return () => clearInterval(id);
  }, []);

  const day = getDay(state, activeDate);
  const ordered = orderTasks(day.tasks);

  function move(id: number, dir: -1 | 1) {
    haptic();
    editDay(activeDate, (d) => {
      const list = orderTasks(d.tasks);
      const i = list.findIndex((t) => t.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      if (list[i].completed !== list[j].completed) return;
      [list[i], list[j]] = [list[j], list[i]];
      d.tasks = list;
    });
  }

  return (
    <div className="space-y-4">
      <SectionTitle>Daily targets & tasks</SectionTitle>

      <Card>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-muted-foreground">
            Active date
            <input
              type="date"
              value={activeDate}
              onChange={(e) => setActiveDate(e.target.value)}
              className={cn(inputClass, "mt-1 text-foreground")}
            />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Target hours
            <input
              type="number"
              step={0.5}
              min={0}
              value={day.targetHours}
              onChange={(e) =>
                editDay(activeDate, (d) => {
                  d.targetHours = Math.max(0, Number(e.target.value) || 0);
                })
              }
              className={cn(inputClass, "mt-1 text-foreground")}
            />
          </label>
        </div>
        {activeDate !== todayKey() ? (
          <button
            onClick={() => setActiveDate(todayKey())}
            className="press mt-2 text-xs font-semibold text-primary"
          >
            Jump back to today
          </button>
        ) : null}
      </Card>

      <Card>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <input
            value={name}
            placeholder="New task…"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTask();
            }}
            className={inputClass}
          />
          <Btn onClick={addTask} className="shrink-0">
            <Plus className="h-4 w-4" /> Add
          </Btn>
        </div>
      </Card>

      <div className="space-y-2">
        {hydrated && ordered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No tasks yet for this day.
          </p>
        ) : null}
        {ordered.map((t, i) => (
          <div
            key={t.id}
            className="surface-card rise grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3"
          >
            <button
              onClick={() => {
                haptic();
                editDay(activeDate, (d) => {
                  const task = d.tasks.find((x) => x.id === t.id);
                  if (task) task.completed = !task.completed;
                  d.tasks = orderTasks(d.tasks);
                });
              }}
              className={cn(
                "press grid h-7 w-7 shrink-0 place-items-center rounded-lg border",
                t.completed
                  ? "border-transparent bg-success text-success-foreground"
                  : "border-border bg-surface-2",
              )}
            >
              {t.completed ? <Check className="h-4 w-4" /> : null}
            </button>
            <span
              className={cn(
                "min-w-0 truncate text-sm font-medium",
                t.completed && "text-muted-foreground line-through",
              )}
            >
              {t.name}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <IconBtn onClick={() => move(t.id, -1)} disabled={i === 0}>
                <ArrowUp className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn onClick={() => move(t.id, 1)} disabled={i === ordered.length - 1}>
                <ArrowDown className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                onClick={() => {
                  haptic();
                  editDay(activeDate, (d) => {
                    d.tasks = d.tasks.filter((x) => x.id !== t.id);
                  });
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </IconBtn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  function addTask() {
    const value = name.trim();
    if (!value) return;
    haptic();
    editDay(activeDate, (d) => {
      d.tasks.push({ id: Date.now(), name: value, completed: false });
      d.tasks = orderTasks(d.tasks);
    });
    setName("");
  }
}

function IconBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="press grid h-8 w-8 place-items-center rounded-lg bg-secondary text-secondary-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** Completed tasks always sink to the bottom, order otherwise preserved. */
function orderTasks(tasks: Task[]): Task[] {
  const open = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);
  return [...open, ...done];
}

function yesterdayOf(dateKey: string) {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
