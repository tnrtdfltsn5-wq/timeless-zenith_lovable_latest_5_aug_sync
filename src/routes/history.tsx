import { createFileRoute } from "@tanstack/react-router";
import {
  computeDayScore,
  dayTotals,
  formatHM,
  useAppState,
} from "@/lib/store";
import { Card, SectionTitle, useHydrated } from "@/components/kit";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History Archive — Flow Tracker" },
      {
        name: "description",
        content: "Every tracked day archived with total study time, score and task completion.",
      },
      { property: "og:title", content: "History Archive — Flow Tracker" },
      {
        property: "og:description",
        content: "Browse past days with logged hours, score and completion rate.",
      },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const state = useAppState();
  const hydrated = useHydrated();
  const keys = Object.keys(state.db).sort().reverse();

  return (
    <div className="space-y-4">
      <SectionTitle>History archive</SectionTitle>
      {hydrated && keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">No history yet — log your first session.</p>
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
                  <div className="truncate font-display text-sm font-bold">{k}</div>
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
