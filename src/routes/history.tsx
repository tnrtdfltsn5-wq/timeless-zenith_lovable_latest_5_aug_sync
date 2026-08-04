import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  computeDayScore,
  dayTotals,
  formatHM,
  formatDateDMY,
  todayKey,
  useAppState,
} from "@/lib/store";
import { Card, SectionTitle, Stat, useHydrated } from "@/components/kit";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Monthly History — Flow Tracker" },
      {
        name: "description",
        content: "Browse any month of tracked days with study time, score and task completion.",
      },
      { property: "og:title", content: "Monthly History — Flow Tracker" },
      {
        property: "og:description",
        content: "Month-by-month archive of logged hours, score and completion rate.",
      },
    ],
  }),
  component: HistoryPage,
});

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function HistoryPage() {
  const state = useAppState();
  const hydrated = useHydrated();
  const [month, setMonth] = useState(() => todayKey().slice(0, 7)); // yyyy-mm

  const keys = Object.keys(state.db)
    .filter((k) => k.startsWith(month))
    .sort()
    .reverse();

  const monthMins = keys.reduce((a, k) => a + dayTotals(state.db[k]).total, 0);
  const monthScore = keys.reduce((a, k) => a + computeDayScore(state.db[k], state.settings.coeff), 0);
  const activeDays = keys.filter((k) => dayTotals(state.db[k]).total > 0).length;

  function shift(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const [y, m] = month.split("-");
  const monthLabel = `${MONTHS[Number(m) - 1]} ${y}`;

  return (
    <div className="space-y-4">
      <SectionTitle>History archive</SectionTitle>

      <Card>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
          <button
            onClick={() => shift(-1)}
            className="press grid h-9 w-9 place-items-center rounded-xl bg-secondary"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="relative text-center">
            <div className="font-display text-base font-extrabold">{monthLabel}</div>
            <div className="text-[11px] text-muted-foreground">{keys.length} tracked days</div>
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="absolute inset-0 h-full w-full opacity-0"
              aria-label="Pick a month"
            />
          </div>
          <button
            onClick={() => shift(1)}
            className="press grid h-9 w-9 place-items-center rounded-xl bg-secondary"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Studied" value={hydrated ? formatHM(monthMins) : "—"} tone="success" />
        <Stat label="Points" value={hydrated ? monthScore.toFixed(0) : "—"} tone="primary" />
        <Stat label="Active days" value={hydrated ? String(activeDays) : "—"} />
      </div>

      {hydrated && keys.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nothing tracked in {monthLabel}.
        </p>
      ) : null}

      <div className="space-y-2">
        {keys.map((k) => {
          const day = state.db[k];
          const totals = dayTotals(day);
          const score = computeDayScore(day, state.settings.coeff);
          const done = day.tasks.filter((t) => t.completed).length;
          return (
            <Card key={k} className="p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div className="min-w-0">
                  <div className="truncate font-display text-sm font-bold">{formatDateDMY(k)}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    Flow {formatHM(totals.flow)} · Shallow {formatHM(totals.shallow)} · Tasks {done}/
                    {day.tasks.length}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-display text-sm font-bold text-success">
                    {formatHM(totals.total)}
                  </div>
                  <div className="gradient-text font-display text-base font-extrabold">
                    {score.toFixed(0)}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
