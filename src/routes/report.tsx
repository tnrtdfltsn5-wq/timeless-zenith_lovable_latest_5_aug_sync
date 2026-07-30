import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Printer } from "lucide-react";
import {
  breakTotals,
  computeDayScore,
  computeSlots,
  dayTotals,
  formatHM,
  getDay,
  taskProgress,
  todayKey,
  useAppState,
} from "@/lib/store";
import { Btn, Card, SectionTitle, inputClass, useHydrated } from "@/components/kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Daily Report — Printable Focus Summary" },
      {
        name: "description",
        content:
          "Generate a printable PDF report of the day: slot-by-slot study time, task completion, achievement and score.",
      },
      { property: "og:title", content: "Daily Report — Printable Focus Summary" },
      {
        property: "og:description",
        content: "Print or save a high-contrast PDF summary of your focus day.",
      },
    ],
  }),
  component: ReportPage,
});

function ReportPage() {
  const state = useAppState();
  const hydrated = useHydrated();
  const [date, setDate] = useState(todayKey());
  const day = getDay(state, date);
  const slots = computeSlots(day, date, new Date());
  const totals = dayTotals(day);
  const breaks = breakTotals(day);
  const score = computeDayScore(state.db[date], state.settings.coeff);
  const targetMins = (day.targetHours || 0) * 60;
  const dayPct = targetMins ? Math.min(100, (totals.total / targetMins) * 100) : 0;
  const usedSlots = slots.filter((s) => !s.disabled && (s.loggedMins > 0 || s.targetMins > 0));
  const tasks = day.tasks ?? [];
  const taskPct = tasks.length
    ? (tasks.reduce((a, t) => a + taskProgress(t), 0) / tasks.length) * 100
    : 0;

  return (
    <div className="space-y-4">
      <div className="no-print space-y-3">
        <SectionTitle
          right={
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={cn(inputClass, "w-auto py-1.5 text-xs")}
            />
          }
        >
          Report generation
        </SectionTitle>
        <Card>
          <p className="text-xs text-muted-foreground">
            Generates a high-contrast printable sheet for the selected day. Tap print, then choose
            <strong className="text-foreground"> Save as PDF</strong> as the destination.
          </p>
          <Btn className="mt-3 w-full" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print / save as PDF
          </Btn>
        </Card>
      </div>

      {!hydrated ? null : (
        <div
          className="print-sheet overflow-hidden rounded-3xl border-2 p-5"
          style={{
            background: "var(--ink-paper)",
            color: "var(--ink-k)",
            borderColor: "var(--ink-k)",
          }}
        >
          {/* Masthead */}
          <div className="print-block flex items-end justify-between gap-3 border-b-4 pb-3" style={{ borderColor: "var(--ink-k)" }}>
            <div className="min-w-0">
              <div className="text-[10px] font-black tracking-[0.35em] uppercase">Flow Tracker</div>
              <h2 className="font-display text-3xl leading-none font-black tracking-tighter">
                DAILY REPORT
              </h2>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[10px] font-black tracking-[0.2em] uppercase">Date</div>
              <div className="font-mono text-sm font-extrabold">{date}</div>
            </div>
          </div>

          <div className="mt-2 flex h-2 w-full">
            <span className="flex-1" style={{ background: "var(--ink-c)" }} />
            <span className="flex-1" style={{ background: "var(--ink-m)" }} />
            <span className="flex-1" style={{ background: "var(--ink-y)" }} />
            <span className="flex-1" style={{ background: "var(--ink-k)" }} />
          </div>

          {/* Headline numbers */}
          <div className="print-block mt-4 grid grid-cols-2 gap-3">
            <PaperStat label="Total studied" value={formatHM(totals.total)} ink="var(--ink-c)" />
            <PaperStat label="Score gained" value={score.toFixed(0)} ink="var(--ink-m)" />
            <PaperStat label="Target" value={formatHM(targetMins)} ink="var(--ink-k)" />
            <PaperStat label="Achievement" value={`${Math.round(dayPct)}%`} ink="var(--ink-y)" />
          </div>

          <div className="print-block mt-3 grid grid-cols-3 gap-2 text-center">
            <MiniStat label="Flow" value={formatHM(totals.flow)} />
            <MiniStat label="Shallow" value={formatHM(totals.shallow)} />
            <MiniStat label="Breaks" value={formatHM(breaks.total)} />
          </div>

          {/* Slots */}
          <PaperHeading>Slot by slot</PaperHeading>
          {usedSlots.length === 0 ? (
            <p className="text-xs">No slot activity recorded for this day.</p>
          ) : (
            <div className="space-y-1.5">
              {usedSlots.map((s) => {
                const ids = day.slotTaskIds?.[s.slot] ?? [];
                const names = ids
                  .map((id) => tasks.find((t) => t.id === id))
                  .filter(Boolean)
                  .map((t) => `${t!.name}${taskProgress(t!) >= 1 ? " ✓" : ""}`);
                if (day.slotAssignments?.[s.slot]) names.unshift(day.slotAssignments[s.slot]);
                return (
                  <div
                    key={s.slot}
                    className="print-block grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b pb-1.5"
                    style={{ borderColor: "color-mix(in oklab, var(--ink-k) 25%, transparent)" }}
                  >
                    <span className="font-mono text-[11px] font-bold">{s.slot}</span>
                    <span className="min-w-0">
                      <span className="block h-2 w-full" style={{ background: "color-mix(in oklab, var(--ink-k) 12%, transparent)" }}>
                        <span
                          className="block h-2"
                          style={{
                            width: `${Math.round(s.progress)}%`,
                            background: s.progress >= 100 ? "var(--ink-c)" : "var(--ink-m)",
                          }}
                        />
                      </span>
                      {names.length ? (
                        <span className="mt-0.5 block truncate text-[10px] font-semibold">
                          {names.join(" · ")}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-right font-mono text-[11px] font-bold">
                      {formatHM(s.loggedMins)}/{formatHM(s.targetMins)} · {Math.round(s.progress)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tasks */}
          <PaperHeading>Tasks · {Math.round(taskPct)}% complete</PaperHeading>
          {tasks.length === 0 ? (
            <p className="text-xs">No tasks planned for this day.</p>
          ) : (
            <div className="space-y-1.5">
              {tasks.map((t) => {
                const p = Math.round(taskProgress(t) * 100);
                return (
                  <div key={t.id} className="print-block">
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                      <span
                        className="grid h-4 w-4 place-items-center text-[10px] font-black"
                        style={{
                          background: p >= 100 ? "var(--ink-c)" : "transparent",
                          border: "2px solid var(--ink-k)",
                        }}
                      >
                        {p >= 100 ? "✓" : ""}
                      </span>
                      <span className="min-w-0 truncate text-xs font-bold">{t.name}</span>
                      <span className="font-mono text-[11px] font-bold">{p}%</span>
                    </div>
                    {(t.subtasks ?? []).length ? (
                      <div className="mt-0.5 ml-6 text-[10px]">
                        {(t.subtasks ?? [])
                          .map((s) => `${s.completed ? "✓" : "○"} ${s.name}`)
                          .join("   ")}
                      </div>
                    ) : null}
                    {t.comment ? (
                      <div className="mt-0.5 ml-6 text-[10px] italic">“{t.comment}”</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {/* Breaks */}
          {breaks.total > 0 ? (
            <>
              <PaperHeading>Breaks</PaperHeading>
              <div className="flex flex-wrap gap-2">
                {Object.entries(breaks.byTag).map(([tag, mins]) => (
                  <span
                    key={tag}
                    className="px-2 py-1 text-[10px] font-black tracking-wide uppercase"
                    style={{ background: "var(--ink-y)", color: "var(--ink-k)" }}
                  >
                    {tag} — {formatHM(mins)}
                  </span>
                ))}
              </div>
            </>
          ) : null}

          <div
            className="print-block mt-5 flex items-center justify-between border-t-4 pt-2 text-[10px] font-black tracking-[0.2em] uppercase"
            style={{ borderColor: "var(--ink-k)" }}
          >
            <span>Generated by Flow Tracker</span>
            <span>{formatHM(totals.total)} · {score.toFixed(0)} pts</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PaperHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="mt-5 mb-2 inline-block px-2 py-1 font-display text-[11px] font-black tracking-[0.25em] uppercase"
      style={{ background: "var(--ink-k)", color: "var(--ink-paper)" }}
    >
      {children}
    </h3>
  );
}

function PaperStat({ label, value, ink }: { label: string; value: string; ink: string }) {
  return (
    <div className="print-block border-2 p-3" style={{ borderColor: "var(--ink-k)" }}>
      <div className="text-[9px] font-black tracking-[0.2em] uppercase">{label}</div>
      <div className="font-display text-2xl font-black tracking-tighter" style={{ color: ink }}>
        {value}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="print-block px-2 py-1.5"
      style={{ background: "color-mix(in oklab, var(--ink-k) 8%, transparent)" }}
    >
      <div className="text-[9px] font-black tracking-[0.18em] uppercase">{label}</div>
      <div className="font-mono text-xs font-extrabold">{value}</div>
    </div>
  );
}
