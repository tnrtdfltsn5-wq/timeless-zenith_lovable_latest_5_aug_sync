import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  MessageSquare,
  Plus,
  Trash2,
} from "lucide-react";
import {
  ALL_SLOTS,
  editDay,
  formatDateDMY,
  formatHM,
  getDay,
  slotHourNumber,
  slotLabel12,
  subtaskProgress,
  syncTaskCompletion,
  taskProgress,
  todayKey,
  useAppState,
  type SubTask,
  type Task,
} from "@/lib/store";

import { Btn, Card, Progress, SectionTitle, inputClass, useHydrated } from "@/components/kit";
import { haptic } from "@/lib/alarm";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks, Subtasks & Daily Target — Flow Tracker" },
      {
        name: "description",
        content:
          "Plan the day with tasks, subtasks, comments and time-boxed slots so partial progress still counts.",
      },
      { property: "og:title", content: "Tasks, Subtasks & Daily Target — Flow Tracker" },
      {
        property: "og:description",
        content: "Subtask-weighted progress, comments and slot deadlines for every task.",
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
  const [openId, setOpenId] = useState<number | null>(null);

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
  const overall = ordered.length
    ? (ordered.reduce((a, t) => a + taskProgress(t), 0) / ordered.length) * 100
    : 0;

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

  function patch(id: number, fn: (t: Task) => void) {
    editDay(activeDate, (d) => {
      const t = d.tasks.find((x) => x.id === id);
      if (t) {
        fn(t);
        syncTaskCompletion(t);
      }
      d.tasks = orderTasks(d.tasks);

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
            <span className="mt-0.5 block text-[10px] text-muted-foreground">
              {formatDateDMY(activeDate)}
            </span>
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
        <Progress className="mt-3" value={overall} tone="success" />
        <div className="mt-1 text-[11px] text-muted-foreground">
          {Math.round(overall)}% of today's task load complete (subtasks count partially)
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
        {ordered.map((t, i) => {
          const pct = taskProgress(t) * 100;
          const open = openId === t.id;
          const subs = t.subtasks ?? [];
          const perSub =
            t.plannedMins && subs.length ? Math.round(t.plannedMins / subs.length) : null;
          return (
            <div key={t.id} className="surface-card rise p-3">
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <button
                  onClick={() => {
                    haptic();
                    patch(t.id, (task) => {
                      const next = !(taskProgress(task) >= 1);
                      task.completed = next;
                      (task.subtasks ?? []).forEach((s) => {
                        s.completed = next;
                        (s.steps ?? []).forEach((st) => (st.completed = next));
                      });
                    });
                  }}

                  className={cn(
                    "press grid h-7 w-7 shrink-0 place-items-center rounded-lg border",
                    pct >= 100
                      ? "border-transparent bg-success text-success-foreground"
                      : "border-border bg-surface-2",
                  )}
                >
                  {pct >= 100 ? <Check className="h-4 w-4" /> : null}
                </button>
                <button
                  onClick={() => setOpenId(open ? null : t.id)}
                  className="min-w-0 text-left"
                >
                  <span
                    className={cn(
                      "block truncate text-sm font-medium",
                      pct >= 100 && "text-muted-foreground line-through",
                    )}
                  >
                    {t.name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    {open ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    {subs.length ? `${subs.filter((s) => s.completed).length}/${subs.length} subtasks · ` : ""}
                    {Math.round(pct)}%
                    {t.fromHour !== null && t.fromHour !== undefined ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {slotLabel12(`${String(t.fromHour).padStart(2, "0")}:00 - ${String((t.toHour ?? t.fromHour) + 1).padStart(2, "0")}:00`)}
                      </span>
                    ) : null}
                    {t.comment ? <MessageSquare className="h-3 w-3" /> : null}
                  </span>
                </button>
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

              {subs.length ? <Progress className="mt-2" value={pct} /> : null}

              {open ? (
                <div className="rise mt-3 space-y-3 border-t border-border pt-3">
                  {/* Subtasks */}
                  <div>
                    <div className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                      Subtasks
                    </div>
                    <div className="mt-1.5 space-y-1.5">
                      {subs.map((s) => (
                        <SubtaskRow
                          key={s.id}
                          sub={s}
                          perSub={perSub}
                          onToggle={() => {
                            haptic();
                            patch(t.id, (task) => {
                              const sub = (task.subtasks ?? []).find((x) => x.id === s.id);
                              if (!sub) return;
                              const next = !(subtaskProgress(sub) >= 1);
                              sub.completed = next;
                              (sub.steps ?? []).forEach((st) => (st.completed = next));
                            });
                          }}
                          onToggleStep={(stepId) => {
                            haptic();
                            patch(t.id, (task) => {
                              const sub = (task.subtasks ?? []).find((x) => x.id === s.id);
                              const st = (sub?.steps ?? []).find((x) => x.id === stepId);
                              if (st) st.completed = !st.completed;
                            });
                          }}
                          onAddStep={(value) =>
                            patch(t.id, (task) => {
                              const sub = (task.subtasks ?? []).find((x) => x.id === s.id);
                              if (!sub) return;
                              sub.steps = [
                                ...(sub.steps ?? []),
                                { id: Date.now(), name: value, completed: false },
                              ];
                            })
                          }
                          onRemoveStep={(stepId) =>
                            patch(t.id, (task) => {
                              const sub = (task.subtasks ?? []).find((x) => x.id === s.id);
                              if (sub) sub.steps = (sub.steps ?? []).filter((x) => x.id !== stepId);
                            })
                          }
                          onRemove={() =>
                            patch(t.id, (task) => {
                              task.subtasks = (task.subtasks ?? []).filter((x) => x.id !== s.id);
                            })
                          }
                        />
                      ))}
                    </div>

                    <SubtaskAdder onAdd={(value) =>
                      patch(t.id, (task) => {
                        task.subtasks = [
                          ...(task.subtasks ?? []),
                          { id: Date.now(), name: value, completed: false },
                        ];
                        task.completed = false;
                      })
                    } />
                  </div>

                  {/* Time box */}
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-[11px] font-semibold text-muted-foreground">
                      From slot
                      <select
                        value={t.fromHour ?? ""}
                        onChange={(e) =>
                          patch(t.id, (task) => {
                            task.fromHour = e.target.value === "" ? null : Number(e.target.value);
                          })
                        }
                        className={cn(inputClass, "mt-1 px-2 py-1.5 text-xs")}
                      >
                        <option value="">—</option>
                        {ALL_SLOTS.map((s) => (
                          <option key={s} value={slotHourNumber(s)}>
                            {slotLabel12(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[11px] font-semibold text-muted-foreground">
                      To slot
                      <select
                        value={t.toHour ?? ""}
                        onChange={(e) =>
                          patch(t.id, (task) => {
                            task.toHour = e.target.value === "" ? null : Number(e.target.value);
                          })
                        }
                        className={cn(inputClass, "mt-1 px-2 py-1.5 text-xs")}
                      >
                        <option value="">—</option>
                        {ALL_SLOTS.map((s) => (
                          <option key={s} value={slotHourNumber(s)}>
                            {slotLabel12(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[11px] font-semibold text-muted-foreground">
                      Planned mins
                      <input
                        type="number"
                        min={0}
                        value={t.plannedMins ?? ""}
                        onChange={(e) =>
                          patch(t.id, (task) => {
                            task.plannedMins =
                              e.target.value === "" ? null : Math.max(0, Number(e.target.value));
                          })
                        }
                        className={cn(inputClass, "mt-1 px-2 py-1.5 text-xs")}
                      />
                    </label>
                  </div>

                  {/* Slots this task is assigned to (synced across pages) */}
                  <AssignedSlots taskId={t.id} day={day} />

                  {/* Comment */}
                  <label className="block text-[11px] font-semibold text-muted-foreground">
                    Comment
                    <textarea
                      rows={2}
                      value={t.comment ?? ""}
                      placeholder="Notes, context, blockers…"
                      onChange={(e) =>
                        patch(t.id, (task) => {
                          task.comment = e.target.value;
                        })
                      }
                      className={cn(inputClass, "mt-1 resize-none text-foreground")}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );

  function addTask() {
    const value = name.trim();
    if (!value) return;
    haptic();
    editDay(activeDate, (d) => {
      d.tasks.push({ id: Date.now(), name: value, completed: false, subtasks: [] });
      d.tasks = orderTasks(d.tasks);
    });
    setName("");
  }
}

function SubtaskRow({
  sub,
  perSub,
  onToggle,
  onToggleStep,
  onAddStep,
  onRemoveStep,
  onRemove,
}: {
  sub: SubTask;
  perSub: number | null;
  onToggle: () => void;
  onToggleStep: (stepId: number) => void;
  onAddStep: (value: string) => void;
  onRemoveStep: (stepId: number) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const steps = sub.steps ?? [];
  const pct = subtaskProgress(sub) * 100;
  const done = pct >= 100;
  return (
    <div className="rounded-xl bg-surface-2/60 p-2">
      <div className="flex items-center gap-2">
        <button
          onClick={onToggle}
          className={cn(
            "press grid h-5 w-5 shrink-0 place-items-center rounded-md border",
            done
              ? "border-transparent bg-success text-success-foreground"
              : "border-border bg-surface-2",
          )}
        >
          {done ? <Check className="h-3 w-3" /> : null}
        </button>
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <span className={cn("block truncate text-xs", done && "text-muted-foreground line-through")}>
            {sub.name}
            {perSub ? (
              <span className="ml-1 text-[10px] text-muted-foreground">· {formatHM(perSub)}</span>
            ) : null}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {steps.length
              ? `${steps.filter((s) => s.completed).length}/${steps.length} steps · ${Math.round(pct)}%`
              : "add steps"}
          </span>
        </button>
        <button onClick={onRemove} className="press shrink-0 text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {steps.length ? <Progress className="mt-1.5" value={pct} tone="success" /> : null}

      {open ? (
        <div className="rise mt-2 space-y-1.5 border-t border-border pt-2 pl-7">
          {steps.map((st) => (
            <div key={st.id} className="flex items-center gap-2">
              <button
                onClick={() => onToggleStep(st.id)}
                className={cn(
                  "press grid h-4 w-4 shrink-0 place-items-center rounded border",
                  st.completed
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border bg-surface",
                )}
              >
                {st.completed ? <Check className="h-2.5 w-2.5" /> : null}
              </button>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[11px]",
                  st.completed && "text-muted-foreground line-through",
                )}
              >
                {st.name}
              </span>
              <button onClick={() => onRemoveStep(st.id)} className="press shrink-0 text-destructive">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          <SubtaskAdder placeholder="Add step (reading, writing…)" onAdd={onAddStep} />
        </div>
      ) : null}
    </div>
  );
}

function SubtaskAdder({ onAdd, placeholder = "Add subtask…" }: { onAdd: (value: string) => void; placeholder?: string }) {
  const [value, setValue] = useState("");
  function submit() {
    const v = value.trim();
    if (!v) return;
    haptic();
    onAdd(v);
    setValue("");
  }
  return (
    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        className={cn(inputClass, "px-2 py-1.5 text-xs")}
      />
      <Btn size="sm" variant="ghost" onClick={submit}>
        <Plus className="h-3.5 w-3.5" />
      </Btn>
    </div>
  );
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

/** Shows every slot (across all pages) this task is attached to. */
function AssignedSlots({ taskId, day }: { taskId: number; day: ReturnType<typeof getDay> }) {
  const assigned = ALL_SLOTS.filter((s) => (day.slotTaskIds?.[s] ?? []).includes(taskId));
  if (!assigned.length) return null;
  return (
    <div className="rounded-xl bg-accent/40 p-2.5 text-xs">
      <div className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
        Assigned to slots (synced everywhere)
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {assigned.map((s) => (
          <span
            key={s}
            className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold"
          >
            {slotLabel12(s)}
          </span>
        ))}
      </div>
    </div>
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
