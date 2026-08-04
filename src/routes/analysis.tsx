import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { TrendingUp } from "lucide-react";
import {
  computeDayScore,
  computeStreak,
  dateKeyOf,
  dayTotals,
  formatDateDMY,
  formatHM,
  prevDateKey,
  todayKey,
  useAppState,
} from "@/lib/store";
import { Card, Pill, SectionTitle, Stat, useHydrated } from "@/components/kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analysis")({
  head: () => ({
    meta: [
      { title: "Performance Analysis — Flow Tracker" },
      {
        name: "description",
        content:
          "Scrollable performance curve of daily study hours, score and consistency across every tracked day.",
      },
      { property: "og:title", content: "Performance Analysis — Flow Tracker" },
      {
        property: "og:description",
        content: "See your focus trend day by day with a scrollable performance curve.",
      },
    ],
  }),
  component: AnalysisPage,
});

type Point = { key: string; mins: number; score: number; target: number };

function AnalysisPage() {
  const state = useAppState();
  const hydrated = useHydrated();
  const [metric, setMetric] = useState<"time" | "score">("time");
  const [range, setRange] = useState(7);
  const scrollRef = useRef<HTMLDivElement>(null);

  const points: Point[] = buildSeries(state, range);

  useEffect(() => {
    if (!hydrated) return;
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [hydrated, range, metric]);

  const values = points.map((p) => (metric === "time" ? p.mins : p.score));
  const max = Math.max(1, ...values);
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const best = points.reduce<Point | null>(
    (a, p) => (!a || (metric === "time" ? p.mins : p.score) > (metric === "time" ? a.mins : a.score) ? p : a),
    null,
  );
  const streak = computeStreak(state.db);

  const stepX = 46;
  const chartW = Math.max(points.length * stepX, 320);
  const chartH = 180;
  const pad = 18;
  const coords = points.map((p, i) => {
    const v = metric === "time" ? p.mins : p.score;
    return {
      x: i * stepX + stepX / 2,
      y: pad + (1 - v / max) * (chartH - pad * 2),
      p,
      v,
    };
  });
  const line = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");
  const area = coords.length
    ? `${line} L${coords[coords.length - 1].x},${chartH} L${coords[0].x},${chartH} Z`
    : "";

  return (
    <div className="space-y-4">
      <SectionTitle
        right={
          <div className="flex gap-1.5">
            {[7, 14, 30, 90].map((r) => (
              <Pill key={r} active={range === r} onClick={() => setRange(r)}>
                {r}d
              </Pill>
            ))}
          </div>
        }
      >
        Performance analysis
      </SectionTitle>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Average" value={hydrated ? fmt(avg, metric) : "—"} tone="primary" />
        <Stat label="Best day" value={hydrated && best ? fmt(metric === "time" ? best.mins : best.score, metric) : "—"} />
        <Stat label="Streak" value={hydrated ? `${streak.count}d` : "—"} tone="success" />
      </div>

      <Card>
        <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-2xl bg-surface-2 p-1.5">
          {(["time", "score"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={cn(
                "press rounded-xl py-2 text-xs font-bold",
                metric === m ? "gradient-fill text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {m === "time" ? "Study time" : "Score"}
            </button>
          ))}
        </div>

        {!hydrated ? (
          <div className="h-48 animate-pulse rounded-2xl bg-surface-2" />
        ) : (
          <div ref={scrollRef} className="-mx-1 overflow-x-auto px-1 pb-1">
            <svg width={chartW} height={chartH + 34} className="block">
              <defs>
                <linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0.25, 0.5, 0.75, 1].map((g) => (
                <line
                  key={g}
                  x1={0}
                  x2={chartW}
                  y1={pad + (1 - g) * (chartH - pad * 2)}
                  y2={pad + (1 - g) * (chartH - pad * 2)}
                  stroke="var(--border)"
                  strokeDasharray="3 5"
                />
              ))}
              {area ? <path d={area} fill="url(#perfFill)" /> : null}
              <path d={line} fill="none" stroke="var(--primary)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
              {coords.map((c) => (
                <g key={c.p.key}>
                  <circle cx={c.x} cy={c.y} r={4} fill="var(--background)" stroke="var(--primary)" strokeWidth={2.5} />
                  <text
                    x={c.x}
                    y={c.y - 10}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="700"
                    fill="var(--foreground)"
                  >
                    {c.v > 0 ? fmtShort(c.v, metric) : ""}
                  </text>
                  <text
                    x={c.x}
                    y={chartH + 14}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="600"
                    fill="var(--muted-foreground)"
                  >
                    {c.p.key.slice(8)}/{c.p.key.slice(5, 7)}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        )}
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" /> Scroll sideways for older days · dates as dd/mm
        </p>
      </Card>

      <Card>
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Day by day
        </div>
        <div className="mt-2 space-y-1.5">
          {[...points].reverse().map((p) => {
            const pct = p.target ? Math.min(100, (p.mins / p.target) * 100) : 0;
            return (
              <div key={p.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                <span className="w-[74px] font-mono text-[11px] font-semibold">{formatDateDMY(p.key)}</span>
                <span className="h-2 overflow-hidden rounded-full bg-secondary">
                  <span className="gradient-fill block h-2 rounded-full" style={{ width: `${pct}%` }} />
                </span>
                <span className="w-[92px] text-right text-[11px] font-semibold">
                  {formatHM(p.mins)} · {p.score.toFixed(0)}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function fmt(v: number, metric: "time" | "score") {
  return metric === "time" ? formatHM(v) : v.toFixed(0);
}
function fmtShort(v: number, metric: "time" | "score") {
  return metric === "time" ? `${(v / 60).toFixed(1)}h` : v.toFixed(0);
}

function buildSeries(state: ReturnType<typeof useAppState>, range: number): Point[] {
  const out: Point[] = [];
  let key = todayKey();
  for (let i = 0; i < range; i++) {
    const day = state.db[key];
    out.push({
      key,
      mins: day ? dayTotals(day).total : 0,
      score: computeDayScore(day, state.settings.coeff),
      target: (day?.targetHours ?? 0) * 60,
    });
    key = prevDateKey(key);
  }
  return out.reverse().filter((p) => p.key <= dateKeyOf(new Date()));
}
