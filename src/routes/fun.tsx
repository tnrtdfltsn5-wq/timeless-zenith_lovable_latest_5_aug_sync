import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Gamepad2, Pause, Play, Square, Trash2, TriangleAlert } from "lucide-react";
import {
  editDay,
  formatClock,
  formatDuration,
  formatHM,
  funCost,
  funPenalty,
  getDay,
  todayKey,
  useAppState,
} from "@/lib/store";
import { Btn, Card, Modal, NumInput, SectionTitle, Stat, inputClass, useHydrated, useNow } from "@/components/kit";
import { haptic } from "@/lib/alarm";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/fun")({
  head: () => ({
    meta: [
      { title: "Entertainment Ledger — Flow Tracker" },
      {
        name: "description",
        content:
          "Track leisure time with a timer that deducts points at the flow-state rate, so downtime always has a price.",
      },
      { property: "og:title", content: "Entertainment Ledger — Flow Tracker" },
      {
        property: "og:description",
        content: "Time your entertainment and see exactly how many points it costs.",
      },
    ],
  }),
  component: FunPage,
});

function FunPage() {
  const state = useAppState();
  const hydrated = useHydrated();
  const now = useNow(1000);
  const key = todayKey();
  const day = getDay(state, key);
  const coeff = state.settings.coeff;

  const [runningSince, setRunningSince] = useState<number | null>(null);
  const [accum, setAccum] = useState(0);
  const [label, setLabel] = useState("");
  const [planMins, setPlanMins] = useState<number | null>(60);
  const [confirmPlan, setConfirmPlan] = useState(false);
  const [pendingStop, setPendingStop] = useState<{ mins: number; start: number; end: number } | null>(null);
  const startedAt = useRef<number | null>(null);

  const liveSecs = accum + (runningSince ? Math.floor((now - runningSince) / 1000) : 0);
  const liveMins = liveSecs / 60;
  const liveCost = funCost(liveMins, coeff);
  const spentToday = funPenalty(day);

  useEffect(() => {
    if (!hydrated) return;
    const raw = window.localStorage.getItem("ft_fun_timer");
    if (!raw) return;
    try {
      const p = JSON.parse(raw) as { start: number | null; accum: number; startedAt: number | null };
      setRunningSince(p.start);
      setAccum(p.accum);
      startedAt.current = p.startedAt;
    } catch {
      /* ignore */
    }
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      "ft_fun_timer",
      JSON.stringify({ start: runningSince, accum, startedAt: startedAt.current }),
    );
  }, [runningSince, accum, hydrated]);

  function start() {
    haptic(15);
    if (!startedAt.current) startedAt.current = Date.now();
    setRunningSince(Date.now());
  }

  function pause() {
    haptic();
    if (runningSince) setAccum((a) => a + Math.floor((Date.now() - runningSince) / 1000));
    setRunningSince(null);
  }

  function stop() {
    haptic([20, 40, 20]);
    const total = accum + (runningSince ? Math.floor((Date.now() - runningSince) / 1000) : 0);
    const end = Date.now();
    const start = startedAt.current ?? end - total * 1000;
    setRunningSince(null);
    setAccum(0);
    startedAt.current = null;
    if (total < 10) return;
    setPendingStop({ mins: total / 60, start, end });
  }

  function commit(mins: number, start: number, end: number) {
    const points = funCost(mins, coeff);
    editDay(key, (d) => {
      d.funLogs = [
        ...(d.funLogs ?? []),
        {
          id: Date.now(),
          start,
          end,
          mins: Math.round(mins * 100) / 100,
          points: Math.round(points * 10) / 10,
          label: label.trim() || "Entertainment",
        },
      ];
    });
    setLabel("");
    setPendingStop(null);
  }

  return (
    <div className="space-y-4">
      <SectionTitle>Entertainment</SectionTitle>

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Deducted today"
          value={hydrated ? `−${spentToday.toFixed(0)}` : "—"}
          sub="points removed from today's score"
        />
        <Stat
          label="Rate"
          value={`${coeff.flowRate}/h`}
          sub="same as flow state, but negative"
        />
      </div>

      <Card glow className="text-center">
        <div className="text-[11px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
          {runningSince ? "Burning points" : accum > 0 ? "Paused" : "Ready"}
        </div>
        <div
          className={cn(
            "font-mono text-[3.2rem] leading-tight font-extrabold tracking-tighter tabular-nums",
            runningSince ? "text-destructive" : "text-foreground",
          )}
        >
          {hydrated ? formatDuration(liveSecs) : "00:00:00"}
        </div>
        <div className="mb-3 text-sm font-bold text-destructive">
          −{liveCost.toFixed(0)} pts so far
        </div>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="What are you watching / playing?"
          className={cn(inputClass, "mb-3")}
        />
        <div className="flex gap-2">
          {runningSince ? (
            <Btn variant="warning" size="lg" className="flex-1" onClick={pause}>
              <Pause className="h-4 w-4" /> Pause
            </Btn>
          ) : (
            <Btn variant="primary" size="lg" className="flex-1" onClick={start}>
              <Play className="h-4 w-4" /> {accum > 0 ? "Resume" : "Start"}
            </Btn>
          )}
          <Btn
            variant="danger"
            size="lg"
            className="flex-1"
            onClick={stop}
            disabled={!runningSince && accum === 0}
          >
            <Square className="h-4 w-4" /> Stop & charge
          </Btn>
        </div>
      </Card>

      <Card>
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Plan a session
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Pick a length first and see the cost before you commit to it.
        </p>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <NumInput value={planMins} onChange={setPlanMins} min={1} suffix="min" />
          <Btn onClick={() => setConfirmPlan(true)} disabled={!planMins}>
            <Gamepad2 className="h-4 w-4" /> Check cost
          </Btn>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[15, 30, 45, 60, 90, 120].map((m) => (
            <button
              key={m}
              onClick={() => {
                setPlanMins(m);
                setConfirmPlan(true);
              }}
              className="press rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold"
            >
              {m}m · −{funCost(m, coeff).toFixed(0)}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Today's entertainment log
        </div>
        {(day.funLogs ?? []).length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Nothing logged — score intact.</p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {(day.funLogs ?? []).map((f) => (
              <div
                key={f.id}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-xl bg-surface-2 px-3 py-2"
              >
                <div className="min-w-0 text-[11px]">
                  <div className="truncate font-semibold">{f.label}</div>
                  <div className="truncate text-muted-foreground">
                    {formatClock(f.start)} — {formatClock(f.end)} · {formatHM(f.mins)}
                  </div>
                </div>
                <span className="text-xs font-bold text-destructive">−{f.points.toFixed(0)}</span>
                <button
                  onClick={() =>
                    editDay(key, (d) => {
                      d.funLogs = (d.funLogs ?? []).filter((x) => x.id !== f.id);
                    })
                  }
                  className="press grid h-7 w-7 place-items-center rounded-lg bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={confirmPlan}
        onClose={() => setConfirmPlan(false)}
        title="That will cost you"
        subtitle={planMins ? `${formatHM(planMins)} of entertainment` : undefined}
      >
        <div className="rounded-3xl border border-destructive/40 bg-destructive/10 p-6 text-center">
          <TriangleAlert className="mx-auto h-8 w-8 text-destructive" />
          <div className="mt-2 font-display text-4xl font-extrabold text-destructive">
            −{funCost(planMins ?? 0, coeff).toFixed(0)}
          </div>
          <div className="text-xs font-semibold text-muted-foreground">points will be deducted</div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Btn variant="outline" onClick={() => setConfirmPlan(false)}>
            Cancel
          </Btn>
          <Btn
            variant="danger"
            onClick={() => {
              setConfirmPlan(false);
              startedAt.current = Date.now();
              setAccum(0);
              setRunningSince(Date.now());
            }}
          >
            Start anyway
          </Btn>
        </div>
      </Modal>

      <Modal
        open={!!pendingStop}
        onClose={() => setPendingStop(null)}
        title="Charge this entertainment?"
        subtitle={pendingStop ? `${formatHM(pendingStop.mins)} · −${funCost(pendingStop.mins, coeff).toFixed(0)} pts` : undefined}
      >
        <div className="grid grid-cols-2 gap-2">
          <Btn variant="outline" onClick={() => setPendingStop(null)}>
            Discard
          </Btn>
          <Btn
            variant="danger"
            onClick={() => pendingStop && commit(pendingStop.mins, pendingStop.start, pendingStop.end)}
          >
            Deduct points
          </Btn>
        </div>
      </Modal>
    </div>
  );
}
