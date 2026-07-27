import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Play, Pause, Square, Zap, Waves, Timer as TimerIcon, Hourglass } from "lucide-react";
import {
  addSession,
  computeDayScore,
  computeSlots,
  dayTotals,
  formatClock,
  formatDuration,
  formatHM,
  getDay,
  lifetimeScores,
  setState,
  slotKeyOfHour,
  todayKey,
  useAppState,
  type Tag,
} from "@/lib/store";
import {
  haptic,
  notify,
  playAlert,
  primeAudio,
  releaseWakeLock,
  requestNotificationPermission,
  requestWakeLock,
  stopBackgroundAudio,
} from "@/lib/alarm";
import { Btn, Card, Pill, Progress, Stat, useHydrated, useNow } from "@/components/kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flow Tracker — Focus Timer & Slot Tracker" },
      {
        name: "description",
        content:
          "Track deep work hour by hour: focus timer, slot targets, live day progress and daily score.",
      },
      { property: "og:title", content: "Flow Tracker — Focus Timer & Slot Tracker" },
      {
        property: "og:description",
        content: "Track deep work hour by hour with slot targets, live progress and scoring.",
      },
    ],
  }),
  component: TimerPage,
});

function TimerPage() {
  const state = useAppState();
  const hydrated = useHydrated();
  const now = useNow(1000);
  const nowDate = new Date(now);
  const key = todayKey();
  const day = getDay(state, key);
  const timer = state.timer;
  const [awaySince, setAwaySince] = useState<number | null>(null);
  const transitioning = useRef(false);

  /* --- away-from-app tracking --- */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        const t = Date.now();
        setAwaySince(t);
        setState((s) => {
          s.lastSeen = t;
        });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (state.lastSeen && awaySince === null) setAwaySince(state.lastSeen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  /* --- elapsed calculation from wall clock (survives throttling) --- */
  const liveSecs =
    timer.running && timer.startTime ? Math.floor((now - timer.startTime) / 1000) : 0;

  const stopwatchSecs = timer.accumulatedSeconds + (timer.mode === "stopwatch" ? liveSecs : 0);
  const pomoRemaining =
    timer.mode === "pomodoro"
      ? Math.max(0, Math.round(timer.pomoRemainingSecs - (timer.running ? liveSecs : 0)))
      : 0;

  /* --- pomodoro phase transitions --- */
  useEffect(() => {
    if (timer.mode !== "pomodoro" || !timer.running || transitioning.current) return;
    if (pomoRemaining > 0) return;
    transitioning.current = true;
    const nowMs = Date.now();
    if (timer.pomoPhase === "work") {
      const start = timer.sessionStart ?? nowMs - state.settings.pomoWork * 60000;
      addSession(start, nowMs, timer.tag, "Pomodoro work block");
      playAlert(state.settings.soundOn);
      notify("Work block complete", "Break started — step away for a moment.");
      setState((s) => {
        s.timer.pomoPhase = "break";
        s.timer.pomoRemainingSecs = s.settings.pomoBreak * 60;
        s.timer.startTime = nowMs;
        s.timer.sessionStart = null;
        s.timer.pomoElapsedWorkSecs = 0;
      });
    } else {
      playAlert(state.settings.soundOn);
      notify("Break over", "Back to focus — the next block is running.");
      setState((s) => {
        s.timer.pomoPhase = "work";
        s.timer.pomoRemainingSecs = s.settings.pomoWork * 60;
        s.timer.startTime = nowMs;
        s.timer.sessionStart = nowMs;
      });
    }
    setTimeout(() => (transitioning.current = false), 400);
  }, [pomoRemaining, timer, state.settings]);

  /* --- derived progress --- */
  const totals = dayTotals(day);
  const targetMins = (day.targetHours || 0) * 60;
  const dayProgressPct = targetMins > 0 ? Math.min(100, (totals.total / targetMins) * 100) : 0;

  const secsToday = nowDate.getHours() * 3600 + nowDate.getMinutes() * 60 + nowDate.getSeconds();
  const clockPct = (secsToday / 86400) * 100;
  const hoursLeft = 24 - secsToday / 3600;

  const slots = computeSlots(day, key, nowDate);
  const currentSlotKey = slotKeyOfHour(nowDate.getHours());
  const currentSlot = slots.find((s) => s.slot === currentSlotKey)!;
  const liveSlotMins =
    timer.running && timer.sessionStart
      ? Math.max(0, (now - Math.max(timer.sessionStart, startOfHour(now))) / 60000)
      : 0;
  const slotLoggedLive = currentSlot.loggedMins + liveSlotMins;
  const slotPct =
    currentSlot.targetMins > 0
      ? Math.min(100, (slotLoggedLive / currentSlot.targetMins) * 100)
      : 0;

  const todayScore = computeDayScore(state.db[key], state.settings.coeff);
  const { net } = lifetimeScores(state);

  /* --- actions --- */
  function start() {
    haptic(15);
    primeAudio();
    requestNotificationPermission();
    void requestWakeLock();
    const t = Date.now();
    setState((s) => {
      s.timer.running = true;
      s.timer.paused = false;
      s.timer.startTime = t;
      if (!s.timer.sessionStart) s.timer.sessionStart = t;
      if (s.timer.mode === "pomodoro" && s.timer.pomoRemainingSecs <= 0) {
        s.timer.pomoRemainingSecs = s.settings.pomoWork * 60;
        s.timer.pomoPhase = "work";
      }
    });
  }

  function pause() {
    haptic();
    const elapsed = timer.startTime ? Math.floor((Date.now() - timer.startTime) / 1000) : 0;
    setState((s) => {
      s.timer.running = false;
      s.timer.paused = true;
      if (s.timer.mode === "stopwatch") s.timer.accumulatedSeconds += elapsed;
      else s.timer.pomoRemainingSecs = Math.max(0, s.timer.pomoRemainingSecs - elapsed);
      s.timer.startTime = null;
    });
  }

  function stop() {
    haptic([20, 40, 20]);
    const end = Date.now();
    const sessionStart = timer.sessionStart;
    const elapsed = timer.startTime ? Math.floor((end - timer.startTime) / 1000) : 0;
    const totalSecs =
      timer.mode === "stopwatch" ? timer.accumulatedSeconds + elapsed : elapsedWork(timer, elapsed);
    if (sessionStart && totalSecs > 30) {
      addSession(sessionStart, end, timer.tag, "Timer session");
    }
    releaseWakeLock();
    stopBackgroundAudio();
    setState((s) => {
      s.timer.running = false;
      s.timer.paused = false;
      s.timer.startTime = null;
      s.timer.accumulatedSeconds = 0;
      s.timer.sessionStart = null;
      s.timer.pomoPhase = "work";
      s.timer.pomoElapsedWorkSecs = 0;
      s.timer.pomoRemainingSecs = s.settings.pomoWork * 60;
    });
  }

  const display =
    timer.mode === "stopwatch" ? formatDuration(stopwatchSecs) : formatDuration(pomoRemaining);
  const statusLabel = !hydrated
    ? "Loading"
    : timer.running
      ? timer.mode === "pomodoro"
        ? timer.pomoPhase === "work"
          ? "Focus block running"
          : "Break running"
        : "Recording"
      : timer.paused
        ? "Paused"
        : "Ready";

  const last = state.lastSession;
  const awayMins = awaySince ? (now - awaySince) / 60000 : 0;

  return (
    <div className="space-y-4">
      {/* Score header */}
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Today's score"
          value={hydrated ? todayScore.toFixed(0) : "—"}
          sub={`${formatHM(totals.total)} logged`}
          tone="primary"
        />
        <Stat
          label="Net total"
          value={hydrated ? net.toFixed(0) : "—"}
          sub="lifetime after redemptions"
          tone="success"
        />
      </div>

      {/* Timer */}
      <Card glow className="text-center">
        <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-2xl bg-surface-2 p-1.5">
          {(["stopwatch", "pomodoro"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                if (timer.running) return;
                haptic();
                setState((s) => {
                  s.timer.mode = m;
                  s.timer.pomoRemainingSecs = s.settings.pomoWork * 60;
                  s.timer.pomoPhase = "work";
                });
              }}
              className={cn(
                "press flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold",
                timer.mode === m
                  ? "gradient-fill text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              {m === "stopwatch" ? (
                <TimerIcon className="h-3.5 w-3.5" />
              ) : (
                <Hourglass className="h-3.5 w-3.5" />
              )}
              {m === "stopwatch" ? "Stopwatch" : "Pomodoro"}
            </button>
          ))}
        </div>

        <div className="text-[11px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
          {statusLabel}
        </div>
        <div
          className={cn(
            "font-mono text-[3.2rem] leading-tight font-extrabold tracking-tighter tabular-nums",
            timer.running ? "gradient-text" : "text-foreground",
          )}
        >
          {display}
        </div>

        <div className="mb-3 flex items-center justify-center gap-2">
          {(["Flow State", "Shallow Work"] as Tag[]).map((t) => (
            <Pill
              key={t}
              active={timer.tag === t}
              onClick={() => {
                haptic();
                setState((s) => {
                  s.timer.tag = t;
                });
              }}
            >
              <span className="inline-flex items-center gap-1">
                {t === "Flow State" ? (
                  <Zap className="h-3 w-3" />
                ) : (
                  <Waves className="h-3 w-3" />
                )}
                {t}
              </span>
            </Pill>
          ))}
        </div>

        {timer.mode === "pomodoro" && !timer.running ? (
          <div className="mb-3 grid grid-cols-2 gap-2 text-left">
            <label className="text-xs font-semibold text-muted-foreground">
              Work mins
              <input
                type="number"
                min={1}
                value={state.settings.pomoWork}
                onChange={(e) =>
                  setState((s) => {
                    s.settings.pomoWork = Math.max(1, Number(e.target.value) || 25);
                    s.timer.pomoRemainingSecs = s.settings.pomoWork * 60;
                  })
                }
                className="mt-1 w-full rounded-xl border border-input bg-surface-2 px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Break mins
              <input
                type="number"
                min={1}
                value={state.settings.pomoBreak}
                onChange={(e) =>
                  setState((s) => {
                    s.settings.pomoBreak = Math.max(1, Number(e.target.value) || 5);
                  })
                }
                className="mt-1 w-full rounded-xl border border-input bg-surface-2 px-3 py-2 text-sm text-foreground"
              />
            </label>
          </div>
        ) : null}

        <div className="flex gap-2">
          {timer.running ? (
            <Btn variant="warning" size="lg" className="flex-1" onClick={pause}>
              <Pause className="h-4 w-4" /> Pause
            </Btn>
          ) : (
            <Btn variant="primary" size="lg" className={cn("flex-1", !timer.paused && "softpulse")} onClick={start}>
              <Play className="h-4 w-4" /> {timer.paused ? "Resume" : "Start"}
            </Btn>
          )}
          <Btn
            variant="danger"
            size="lg"
            className="flex-1"
            onClick={stop}
            disabled={!timer.running && !timer.paused}
          >
            <Square className="h-4 w-4" /> Stop & log
          </Btn>
        </div>

        {timer.mode === "pomodoro" ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Keeps playing with the screen off — audio + vibration fire at each phase change.
          </p>
        ) : null}
      </Card>

      {/* Ongoing slot */}
      <Card>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Ongoing slot
            </div>
            <div className="truncate font-display text-base font-bold">{currentSlotKey}</div>
          </div>
          <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-foreground">
            {currentSlot.disabled ? "Reserved / off" : `${Math.round(slotPct)}%`}
          </span>
        </div>
        <Progress className="mt-2" value={slotPct} />
        <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
          <span>
            Slot progress: <strong className="text-success">{formatHM(slotLoggedLive)}</strong> /{" "}
            {formatHM(currentSlot.targetMins)}
          </span>
          <span>{formatHM(Math.max(0, currentSlot.targetMins - slotLoggedLive))} to go</span>
        </div>
        <div className="mt-3 rounded-xl bg-surface-2 p-3 text-xs">
          <span className="font-semibold text-muted-foreground">Assigned task: </span>
          <span className="font-semibold">
            {currentSlot.assignment || "No task assigned to this slot"}
          </span>
        </div>
      </Card>

      {/* Day progress vs target */}
      <Card>
        <div className="flex justify-between text-xs font-semibold text-muted-foreground">
          <span>Today's progress vs target</span>
          <span className="text-foreground">
            {formatHM(totals.total)} / {formatHM(targetMins)}
          </span>
        </div>
        <Progress className="mt-2" value={dayProgressPct} tone="success" />
        <div className="mt-1 text-[11px] text-muted-foreground">
          {Math.round(dayProgressPct)}% of target · Flow {formatHM(totals.flow)} · Shallow{" "}
          {formatHM(totals.shallow)}
        </div>

        <div className="mt-4 flex justify-between text-xs font-semibold text-muted-foreground">
          <span>Clock: {(secsToday / 3600).toFixed(1)}h passed</span>
          <span>{hoursLeft.toFixed(1)}h left today</span>
        </div>
        <Progress className="mt-2" value={clockPct} tone="warning" />
        <div className="mt-2 rounded-xl bg-accent px-3 py-2 text-center text-xs font-semibold text-accent-foreground">
          Pace needed: {formatHM(paceMins(day, totals.total, slots, nowDate))} per remaining slot
        </div>
      </Card>

      {/* Last session / away */}
      <Card>
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Session context
        </div>
        <div className="mt-1.5 text-sm">
          <strong className="text-foreground">Last session:</strong>{" "}
          {last ? (
            <span className="text-muted-foreground">
              {formatClock(last.start)} to {formatClock(last.end)} ({formatHM(last.mins)})
            </span>
          ) : (
            <span className="text-muted-foreground">No sessions recorded yet</span>
          )}
        </div>
        <div className="mt-1 text-sm">
          <strong className="text-foreground">Away from app since:</strong>{" "}
          <span className="text-muted-foreground">
            {awaySince ? `${formatClock(awaySince)} (${formatHM(awayMins)} ago)` : "Currently active"}
          </span>
        </div>
      </Card>
    </div>
  );
}

function startOfHour(ts: number) {
  const d = new Date(ts);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function elapsedWork(
  timer: ReturnType<typeof useAppState>["timer"],
  elapsed: number,
): number {
  return timer.pomoPhase === "work" ? timer.pomoElapsedWorkSecs + elapsed : 0;
}

function paceMins(
  day: ReturnType<typeof getDay>,
  logged: number,
  slots: ReturnType<typeof computeSlots>,
  now: Date,
) {
  const remaining = Math.max(0, (day.targetHours || 0) * 60 - logged);
  const left = slots.filter((s) => !s.disabled && s.hour >= now.getHours()).length;
  return left ? remaining / left : 0;
}
