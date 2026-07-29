import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Ban, Plus, RotateCcw, Trash2, X } from "lucide-react";

import {
  computeSlots,
  dayTotals,
  editDay,
  formatHM,
  getDay,
  todayKey,
  useAppState,
} from "@/lib/store";
import { Btn, Card, Progress, SectionTitle, inputClass, useHydrated } from "@/components/kit";
import { haptic } from "@/lib/alarm";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/timeline")({
  head: () => ({
    meta: [
      { title: "Timeline & Hourly Slots — Flow Tracker" },
      {
        name: "description",
        content:
          "Hour-by-hour breakdown of logged focus with recalculated slot targets and gap analysis.",
      },
      { property: "og:title", content: "Timeline & Hourly Slots — Flow Tracker" },
      {
        property: "og:description",
        content: "Slot-level targets, logged sessions and unlogged gap analysis for the day.",
      },
    ],
  }),
  component: TimelinePage,
});

function TimelinePage() {
  const state = useAppState();
  const hydrated = useHydrated();
  const [activeDate, setActiveDate] = useState(todayKey());
  const day = getDay(state, activeDate);
  const now = new Date();
  const slots = computeSlots(day, activeDate, now);
  const totals = dayTotals(day);
  const isToday = activeDate === todayKey();

  // Auto-scroll to the current slot only when arriving via the bottom-tray icon
  useEffect(() => {
    if (!hydrated) return;
    if (window.sessionStorage.getItem("ft_scroll_current_slot") !== "1") return;
    window.sessionStorage.removeItem("ft_scroll_current_slot");
    const el = document.getElementById(`slot-${new Date().getHours()}`);
    if (el) {
      const t = setTimeout(
        () => el.scrollIntoView({ behavior: "smooth", block: "center" }),
        120,
      );
      return () => clearTimeout(t);
    }
  }, [hydrated]);


  const elapsedMins = isToday ? now.getHours() * 60 + now.getMinutes() : 24 * 60;
  const activeSlots = slots.filter((s) => !s.disabled);
  const availableMins = activeSlots.filter((s) => s.hour * 60 < elapsedMins).length * 60;
  const unlogged = Math.max(0, availableMins - totals.total);
  const targetMins = (day.targetHours || 0) * 60;

  return (
    <div className="space-y-4">
      <SectionTitle
        right={
          <input
            type="date"
            value={activeDate}
            onChange={(e) => setActiveDate(e.target.value)}
            className={cn(inputClass, "w-auto py-1.5 text-xs")}
          />
        }
      >
        Timeline
      </SectionTitle>

      {/* Summary & gap analysis first */}
      <Card glow>
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Summary & gap analysis
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Metric label="Total work" value={formatHM(totals.total)} />
          <Metric label="Flow" value={formatHM(totals.flow)} tone="success" />
          <Metric label="Shallow" value={formatHM(totals.shallow)} />
        </div>
        <Progress
          className="mt-3"
          value={targetMins ? (totals.total / targetMins) * 100 : 0}
          tone="success"
        />
        <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
          <span>
            {formatHM(totals.total)} of {formatHM(targetMins)} target
          </span>
          <span>{formatHM(Math.max(0, targetMins - totals.total))} remaining</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="text-[11px] text-muted-foreground">Active slots</div>
            <div className="font-display text-base font-bold">
              {activeSlots.length}
              <span className="text-xs font-medium text-muted-foreground"> / 24</span>
            </div>
          </div>
          <div className="rounded-xl bg-destructive/10 p-3">
            <div className="text-[11px] text-muted-foreground">Unlogged gap</div>
            <div className="font-display text-base font-bold text-destructive">
              {formatHM(unlogged)}
            </div>
          </div>
        </div>
      </Card>

      {!hydrated ? null : (
        <div className="space-y-2.5">
          {slots.map((s) => {
            const ongoing = isToday && s.hour === now.getHours();
            return (
              <div
                key={s.slot}
                id={`slot-${s.hour}`}

                className={cn(
                  "surface-card p-3",
                  ongoing && "glow-ring border-primary",
                  s.disabled && "opacity-55",
                )}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-display text-sm font-bold">
                      {s.slot}
                      {ongoing ? (
                        <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">
                          ongoing
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {s.disabled
                        ? "Excluded from distribution"
                        : `${formatHM(s.loggedMins)} of ${formatHM(s.targetMins)}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {!s.disabled ? (
                      <input
                        type="number"
                        step={0.25}
                        min={0}
                        value={s.explicit ? day.slotTargets[s.slot] : ""}
                        placeholder={(s.targetMins / 60).toFixed(2)}
                        onChange={(e) =>
                          editDay(activeDate, (d) => {
                            const v = e.target.value;
                            if (v === "") delete d.slotTargets[s.slot];
                            else d.slotTargets[s.slot] = Math.max(0, Number(v) || 0);
                          })
                        }
                        className="w-16 rounded-lg border border-input bg-surface-2 px-2 py-1 text-center text-xs"
                      />
                    ) : null}
                    {s.explicit ? (
                      <button
                        title="Reset to auto"
                        onClick={() =>
                          editDay(activeDate, (d) => {
                            delete d.slotTargets[s.slot];
                          })
                        }
                        className="press grid h-7 w-7 place-items-center rounded-lg bg-secondary"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    <button
                      title={s.disabled ? "Re-enable slot" : "Remove slot from distribution"}
                      onClick={() => {
                        haptic();
                        editDay(activeDate, (d) => {
                          d.disabledSlots = s.disabled
                            ? d.disabledSlots.filter((x) => x !== s.slot)
                            : [...d.disabledSlots, s.slot];
                        });
                      }}
                      className={cn(
                        "press grid h-7 w-7 place-items-center rounded-lg",
                        s.disabled ? "bg-success text-success-foreground" : "bg-secondary",
                      )}
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {!s.disabled ? <Progress className="mt-2" value={s.progress} /> : null}

                <SlotPlanner slot={s.slot} activeDate={activeDate} day={day} />


                {s.logs.map((l) => (
                  <div
                    key={l.id}
                    className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl bg-surface-2 px-3 py-2"
                  >
                    <div className="min-w-0 text-[11px]">
                      <div className="truncate font-semibold">
                        {l.timeRange} · {formatHM(l.durationMins)}
                      </div>
                      <div className="truncate text-muted-foreground">
                        {l.tag} — {l.desc}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        haptic();
                        editDay(activeDate, (d) => {
                          d.logs = d.logs.filter((x) => x.id !== l.id);
                        });
                      }}
                      className="press grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <Btn
        variant="outline"
        className="w-full"
        onClick={() =>
          editDay(activeDate, (d) => {
            d.slotTargets = {};
          })
        }
      >
        Recalculate all slot targets
      </Btn>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success";
}) {
  return (
    <div className="rounded-xl bg-surface-2 p-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("font-display text-sm font-bold", tone === "success" && "text-success")}>
        {value}
      </div>
    </div>
  );
}
