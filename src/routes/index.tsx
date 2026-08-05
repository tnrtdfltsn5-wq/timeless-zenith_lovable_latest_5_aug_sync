import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Square,
  Zap,
  Waves,
  Timer as TimerIcon,
  Hourglass,
  Plus,
  PartyPopper,
  BellOff,
  Flame,
  Clock3,
} from "lucide-react";
import {
  addBreak,
  addSession,
  BREAK_TAGS,
  computeDayScore,
  computeSlotScore,
  computeSlots,
  computeStreak,
  dayTotals,
  editDay,
  paceInfo,
  prevDateKey,
  formatClock,
  formatDateDMY,
  formatDuration,
  formatHM,
  getDay,
  lifetimeScores,
  setState,
  slotKeyOfHour,
  slotLabel12,
  slotTaskNames,
  slotHourNumber,
  taskProgress,
  todayKey,
  useAppState,
  type Tag,
} from "@/lib/store";
import {
  haptic,
  notify,
  playAlert,
  playStrongAlarm,
  primeAudio,
  releaseWakeLock,
  requestNotificationPermission,
  requestWakeLock,
  stopBackgroundAudio,
} from "@/lib/alarm";

import {
  Btn,
  Card,
  Modal,
  NumInput,
  Pill,
  Progress,
  Stat,
  inputClass,
  useHydrated,
  useNow,
} from "@/components/kit";
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
  const scoreTarget = state.settings.scoreTarget || 1;
  const scorePct = Math.min(100, (todayScore / scoreTarget) * 100);
  const { net } = lifetimeScores(state);
  const hour = nowDate.getHours();
  // tasks scheduled for this slot: assigned in the timeline OR time-boxed here
  const windowTasks = day.tasks.filter((t) => {
    if (t.fromHour === null || t.fromHour === undefined) return false;
    return hour >= t.fromHour && hour <= (t.toHour ?? t.fromHour);
  });
  const activeTaskId = day.slotActiveTask?.[currentSlotKey];
  const activeTask = day.tasks.find((t) => t.id === activeTaskId) ?? null;
  const slotTaskList = Array.from(
    new Set([...slotTaskNames(currentSlotKey, day), ...windowTasks.map((t) => t.name)]),
  );

  // pace + previous-day comparison + streak
  const pace = paceInfo(day, key, nowDate);
  const yKey = prevDateKey(key);
  const yTotals = dayTotals(getDay(state, yKey));
  const compareBase = Math.max(yTotals.total, totals.total, 1);
  const streak = computeStreak(state.db);
  const streakGoal = state.settings.streakTargetDays || 1;
  const [streakEdit, setStreakEdit] = useState(false);
  const clockNow = nowDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  /* --- pending popups --- */
  const [pendingStop, setPendingStop] = useState<{
    start: number;
    end: number;
    secs: number;
  } | null>(null);
  const [stopDesc, setStopDesc] = useState("");
  const [pendingBreak, setPendingBreak] = useState<{ start: number; end: number } | null>(null);
  const [celebrate, setCelebrate] = useState<string | null>(null);

  // minutes left before the current hour slot ends
  const minsLeftInSlot = Math.max(0, 60 - (nowDate.getMinutes() + nowDate.getSeconds() / 60));

  // fire the celebration popup the moment the ongoing slot hits its target
  const prevSlotDone = useRef(false);
  useEffect(() => {
    if (!hydrated) return;
    const done = !currentSlot.disabled && currentSlot.targetMins > 0 && slotLoggedLive >= currentSlot.targetMins;
    if (done && !prevSlotDone.current) {
      const earned = computeSlotScore(currentSlotKey, currentSlot.logs, day, state.settings.coeff);
      setCelebrate(`${slotLabel12(currentSlotKey)} target hit! +${Math.round(earned)} pts`);
      haptic([40, 60, 40, 60, 80]);
      playAlert(state.settings.soundOn);
      notify("Slot target complete", `${slotLabel12(currentSlotKey)} target reached.`);
    }
    prevSlotDone.current = done;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotLoggedLive, currentSlot.targetMins, hydrated]);

  // chime when a brand-new slot begins
  const prevHour = useRef<number | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    const h = nowDate.getHours();
    if (prevHour.current === null) {
      prevHour.current = h;
      return;
    }
    if (prevHour.current !== h) {
      prevHour.current = h;
      playAlert(state.settings.soundOn);
      notify("New slot started", `${slotLabel12(slotKeyOfHour(h))} — fresh target, go.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowDate.getHours(), hydrated]);

  // strong lag alarm: the slot can no longer be completed at the current pace.
  // It repeats (also with the screen off) until the slot is acknowledged.
  const acked = (day.ackLagSlots ?? []).includes(currentSlotKey);
  const neededNow = Math.max(0, currentSlot.targetMins - slotLoggedLive);
  const lagging =
    !currentSlot.disabled &&
    currentSlot.targetMins > 0 &&
    neededNow > 0 &&
    neededNow > minsLeftInSlot &&
    nowDate.getMinutes() >= 5;
  const [lagAsk, setLagAsk] = useState(false);
  const lastLagAlarm = useRef(0);

  useEffect(() => {
    if (!hydrated || !lagging || acked) return;
    const fire = () => {
      if (Date.now() - lastLagAlarm.current < 100000) return;
      lastLagAlarm.current = Date.now();
      playStrongAlarm(state.settings.soundOn);
      haptic([500, 150, 500]);
      notify(
        "You're falling behind",
        `${formatHM(neededNow)} still needed but only ${formatHM(minsLeftInSlot)} left in this slot.`,
      );
    };
    fire();
    setLagAsk(true);
    const id = setInterval(fire, 120000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lagging, acked, currentSlotKey, hydrated]);

  function ackLag() {
    haptic();
    editDay(key, (d) => {
      d.ackLagSlots = Array.from(new Set([...(d.ackLagSlots ?? []), currentSlotKey]));
    });
    setLagAsk(false);
  }

  const lastActivityEnd = Math.max(
    state.lastSession?.end ?? 0,
    ...(day.breaks ?? []).map((b) => b.end),
    ...day.logs.map((l) => l.end),
  );

  /* --- actions --- */
  function start() {
    haptic(15);
    primeAudio();
    requestNotificationPermission();
    void requestWakeLock();
    const t = Date.now();
    // idle period since the last logged activity becomes a break
    if (lastActivityEnd > 0 && t - lastActivityEnd >= 2 * 60000 && !timer.paused) {
      setPendingBreak({ start: lastActivityEnd, end: t });
    }
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
    setAwaySince(null);
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
    if (sessionStart && totalSecs > 30) {
      setStopDesc("");
      setPendingStop({ start: sessionStart, end, secs: totalSecs });
    }
  }

  function confirmStop(tag: Tag) {
    if (!pendingStop) return;
    haptic(15);
    addSession(pendingStop.start, pendingStop.end, tag, stopDesc.trim() || "Timer session");
    setState((s) => {
      s.timer.tag = tag;
    });
    setPendingStop(null);
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
      {/* Row 1 — streak + score */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setStreakEdit(true)}
          className="surface-card press p-3 text-left"
        >
          <div className="flex items-center gap-2">
            <Flame className={cn("h-4 w-4 shrink-0", streak.count > 0 ? "text-warning" : "text-muted-foreground")} />
            <div className="min-w-0">
              <div className="font-display text-base leading-none font-extrabold">
                {hydrated ? streak.count : 0}
                <span className="text-[10px] font-semibold text-muted-foreground"> / {streakGoal}d</span>
              </div>
              <div className="text-[10px] text-muted-foreground">streak · tap to set goal</div>
            </div>
          </div>
          <Progress
            className="mt-1.5 h-1.5"
            value={Math.min(100, (streak.count / streakGoal) * 100)}
            tone="warning"
          />
        </button>
        <div className="surface-card p-3">
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Today
              </div>
              <div className="gradient-text font-display text-xl leading-none font-extrabold">
                {hydrated ? todayScore.toFixed(0) : "—"}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Net
              </div>
              <div className="font-display text-base leading-none font-extrabold text-success">
                {hydrated ? net.toFixed(0) : "—"}
              </div>
            </div>
          </div>
          <div className="mt-1.5 text-[10px] text-muted-foreground">
            {formatHM(totals.total)} logged
          </div>
        </div>
      </div>

      {/* Score target bar */}
      <Card>
        <div className="flex justify-between text-xs font-semibold text-muted-foreground">
          <span>Score vs daily goal</span>
          <span className="text-foreground">
            {hydrated ? todayScore.toFixed(0) : "—"} / {scoreTarget.toFixed(0)} pts
          </span>
        </div>
        <Progress className="mt-2" value={scorePct} tone="primary" />
        <div className="mt-1 text-[11px] text-muted-foreground">
          {Math.round(scorePct)}% of daily score goal · set your target on the Score page
        </div>
      </Card>

      {/* Ongoing slot */}
      <Card>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Ongoing slot
            </div>
            <div className="truncate font-display text-base font-bold">
              {slotLabel12(currentSlotKey)}
            </div>
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
          <span>
            {formatHM(Math.max(0, currentSlot.targetMins - slotLoggedLive))} to go ·{" "}
            <strong className="text-warning">
              {hydrated ? Math.ceil(minsLeftInSlot) : 0} min left
            </strong>
          </span>
        </div>

        <div className="mt-3 rounded-xl bg-surface-2 p-3 text-xs">
          <div>
            <span className="font-semibold text-muted-foreground">Scheduled for this slot: </span>
            <span className="font-semibold">
              {slotTaskList.length ? slotTaskList.join(" · ") : "No task assigned to this slot"}
            </span>
          </div>
          {activeTask ? (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary uppercase">
                Doing now
              </span>
              <span className="min-w-0 truncate font-semibold">{activeTask.name}</span>
              <span className="ml-auto shrink-0 text-[10px] font-bold text-muted-foreground">
                {Math.round(taskProgress(activeTask) * 100)}%
              </span>
            </div>
          ) : null}
        </div>
      </Card>

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

        {timer.mode === "pomodoro" && !timer.running ? (
          <div className="mb-3 grid grid-cols-2 gap-2 text-left">
            <label className="text-xs font-semibold text-muted-foreground">
              Work mins
              <NumInput
                className="mt-1"
                min={1}
                value={state.settings.pomoWork}
                onChange={(v) =>
                  setState((s) => {
                    s.settings.pomoWork = v ?? 25;
                    s.timer.pomoRemainingSecs = s.settings.pomoWork * 60;
                  })
                }
              />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Break mins
              <NumInput
                className="mt-1"
                min={1}
                value={state.settings.pomoBreak}
                onChange={(v) =>
                  setState((s) => {
                    s.settings.pomoBreak = v ?? 5;
                  })
                }
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

        {/* Yesterday mirror */}
        <div className="mt-4 rounded-xl bg-surface-2 p-3">
          <div className="flex justify-between text-[11px] font-semibold text-muted-foreground">
            <span>Today vs yesterday</span>
            <span
              className={cn(
                "font-bold",
                totals.total >= yTotals.total ? "text-success" : "text-destructive",
              )}
            >
              {totals.total >= yTotals.total ? "+" : "−"}
              {formatHM(Math.abs(totals.total - yTotals.total))}
            </span>
          </div>
          <div className="mt-2 space-y-1.5">
            <div className="grid grid-cols-[46px_minmax(0,1fr)_58px] items-center gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Today</span>
              <Progress value={(totals.total / compareBase) * 100} tone="success" />
              <span className="text-right text-[11px] font-semibold">{formatHM(totals.total)}</span>
            </div>
            <div className="grid grid-cols-[46px_minmax(0,1fr)_58px] items-center gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Yest.</span>
              <Progress value={(yTotals.total / compareBase) * 100} tone="warning" />
              <span className="text-right text-[11px] font-semibold">{formatHM(yTotals.total)}</span>
            </div>
          </div>
        </div>
        <div className="mt-2 rounded-xl bg-accent px-3 py-2 text-center text-xs font-semibold text-accent-foreground">
          Pace needed: {formatHM(pace.perSlot)} per remaining slot ·{" "}
          {Math.round(pace.perHour)} min of every 60
        </div>
        <div
          className={cn(
            "mt-1.5 rounded-xl px-3 py-2 text-center text-[11px] font-semibold",
            pace.feasible ? "bg-surface-2 text-muted-foreground" : "bg-destructive/10 text-destructive",
          )}
        >
          {formatHM(pace.remainingTarget)} left to study · {formatHM(pace.usableMins)} of usable time
          remaining today {pace.feasible ? "" : "— target no longer reachable"}
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

      {/* Manual time logger */}
      <ManualLogger />

      {/* Stop & log — tag picker */}
      <Modal
        open={!!pendingStop}
        onClose={() => setPendingStop(null)}
        title="How was that session?"
        subtitle={
          pendingStop
            ? `${formatClock(pendingStop.start)} — ${formatClock(pendingStop.end)} · ${formatHM(
                pendingStop.secs / 60,
              )}`
            : undefined
        }
      >
        <input
          value={stopDesc}
          placeholder="What did you work on? (optional)"
          onChange={(e) => setStopDesc(e.target.value)}
          className={cn(inputClass, "mb-3")}
        />
        <div className="grid grid-cols-2 gap-2">
          {(["Flow State", "Shallow Work"] as Tag[]).map((t) => (
            <button
              key={t}
              onClick={() => confirmStop(t)}
              className="press flex flex-col items-center gap-1 rounded-2xl border border-border bg-surface-2 p-4 hover:border-primary"
            >
              {t === "Flow State" ? (
                <Zap className="h-5 w-5 text-primary" />
              ) : (
                <Waves className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="text-xs font-bold">{t}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setPendingStop(null)}
          className="press mt-3 w-full text-xs font-semibold text-muted-foreground"
        >
          Discard this session
        </button>
      </Modal>

      {/* Idle gap — break tag picker */}
      <Modal
        open={!!pendingBreak}
        onClose={() => setPendingBreak(null)}
        title="You were away — log it as a break?"
        subtitle={
          pendingBreak
            ? `${formatClock(pendingBreak.start)} — ${formatClock(pendingBreak.end)} · ${formatHM(
                (pendingBreak.end - pendingBreak.start) / 60000,
              )}`
            : undefined
        }
      >
        <div className="grid grid-cols-2 gap-2">
          {BREAK_TAGS.map((bt) => (
            <button
              key={bt}
              onClick={() => {
                if (!pendingBreak) return;
                haptic();
                addBreak(pendingBreak.start, pendingBreak.end, bt);
                setPendingBreak(null);
              }}
              className="press rounded-2xl border border-border bg-surface-2 p-3 text-xs font-bold hover:border-primary"
            >
              {bt}
            </button>
          ))}
        </div>
        <button
          onClick={() => setPendingBreak(null)}
          className="press mt-3 w-full text-xs font-semibold text-muted-foreground"
        >
          Skip
        </button>
      </Modal>

      {/* Falling-behind acknowledgement */}
      <Modal
        open={lagAsk && !acked}
        onClose={() => setLagAsk(false)}
        title="You're going to lag this slot"
        subtitle={`${formatHM(neededNow)} still needed but only ${Math.ceil(minsLeftInSlot)} min left in ${slotLabel12(currentSlotKey)}.`}
      >
        <div className="space-y-2">
          <Btn variant="primary" className="w-full" onClick={() => setLagAsk(false)}>
            I'm starting now — keep alerting
          </Btn>
          <Btn variant="outline" className="w-full" onClick={ackLag}>
            <BellOff className="h-4 w-4" /> I acknowledge — silence this slot
          </Btn>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Silencing only affects {slotLabel12(currentSlotKey)}; the next slot alerts again.
        </p>
      </Modal>

      {/* Slot target celebration — full-screen premium takeover */}
      {celebrate ? (
        <div
          className="celebrate-veil fixed inset-0 z-[70] grid place-items-center bg-foreground/60 p-4 backdrop-blur-md"
          onClick={() => setCelebrate(null)}
        >
          <div
            className="celebrate-card relative w-full max-w-md overflow-hidden rounded-[2rem] border border-primary/40 bg-popover p-8 text-center shadow-[var(--shadow-glow)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="celebrate-aura pointer-events-none absolute inset-0 opacity-70" />
            <div className="relative">
              <div className="celebrate-icon mx-auto mb-5 grid h-24 w-24 place-items-center rounded-3xl gradient-fill text-primary-foreground shadow-[var(--shadow-glow)]">
                <PartyPopper className="h-12 w-12" />
              </div>
              <div className="text-[11px] font-bold tracking-[0.35em] text-muted-foreground uppercase">
                Target achieved
              </div>
              <h3 className="gradient-text mt-1 font-display text-4xl leading-tight font-extrabold tracking-tight">
                Slot complete!
              </h3>
              <p className="mt-3 text-base font-bold text-foreground">{celebrate}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                You hit the required pace for this slot. Keep the momentum going.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2 text-left">
                <div className="rounded-2xl bg-surface-2 p-3">
                  <div className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                    Today logged
                  </div>
                  <div className="font-display text-lg font-extrabold">
                    {formatHM(totals.total)}
                  </div>
                </div>
                <div className="rounded-2xl bg-surface-2 p-3">
                  <div className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                    Day score
                  </div>
                  <div className="font-display text-lg font-extrabold text-success">
                    {todayScore.toFixed(0)}
                  </div>
                </div>
              </div>
              <Btn variant="primary" size="lg" className="mt-5 w-full" onClick={() => setCelebrate(null)}>
                Keep going
              </Btn>
            </div>
          </div>
        </div>
      ) : null}

    </div>


      <Modal open={streakEdit} onClose={() => setStreakEdit(false)} title="Streak goal">
        <p className="text-xs text-muted-foreground">
          Hit your daily score target this many days in a row to claim the streak reward.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[7, 15, 21, 30, 60, 100].map((d) => (
            <button
              key={d}
              onClick={() => {
                haptic();
                setState((st) => {
                  st.settings.streakTargetDays = d;
                });
              }}
              className={cn(
                "press rounded-xl px-3 py-2 text-sm font-semibold",
                streakGoal === d ? "bg-primary text-primary-foreground" : "bg-secondary",
              )}
            >
              {d} days
            </button>
          ))}
        </div>
        <div className="mt-3">
          <div className="text-[11px] text-muted-foreground">Custom</div>
          <NumInput
            className="mt-1 w-full"
            value={streakGoal}
            min={1}
            onChange={(v) =>
              setState((st) => {
                st.settings.streakTargetDays = Math.max(1, v);
              })
            }
          />
        </div>
        <Btn className="mt-3 w-full" onClick={() => setStreakEdit(false)}>
          Done
        </Btn>
      </Modal>
  );
}

function ManualLogger() {
  const state = useAppState();
  const [mins, setMins] = useState<number | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showRange, setShowRange] = useState(false);
  const [tag, setTag] = useState<Tag>("Flow State");
  const [desc, setDesc] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pickSlot, setPickSlot] = useState(false);

  const key = todayKey();
  const day = getDay(state, key);
  const slots = computeSlots(day, key, new Date());

  function toTs(hhmm: string) {
    const [h, m] = hhmm.split(":").map(Number);
    const d = new Date();
    d.setHours(h || 0, m || 0, 0, 0);
    return d.getTime();
  }

  function commit(start: number, end: number) {
    haptic(15);
    addSession(start, end, tag, desc.trim() || "Manual entry");
    setMsg(`Logged ${formatHM((end - start) / 60000)} of ${tag}.`);
    setDesc("");
    setMins(null);
    setFrom("");
    setTo("");
  }

  function log() {
    if (showRange && from && to) {
      let start = toTs(from);
      let end = toTs(to);
      if (end <= start) end += 86400000; // crossed midnight
      commit(start, end);
      return;
    }
    const m = mins ?? 0;
    if (!m || m <= 0) {
      setMsg("Enter a duration in minutes, or use an exact time range.");
      return;
    }
    setMsg(null);
    setPickSlot(true);
  }

  function logIntoSlot(hour: number) {
    const m = mins ?? 0;
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    // stack after what's already logged in that slot so entries don't overlap
    const used = slots.find((s) => s.hour === hour)?.loggedMins ?? 0;
    const start = d.getTime() + Math.min(used, 59) * 60000;
    setPickSlot(false);
    commit(start, start + m * 60000);
  }

  return (
    <Card>
      <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        Manual time logger
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Forgot to start the timer? Enter minutes and pick the hour slot — or set an exact range.
      </p>

      <label className="mt-3 block text-xs font-semibold text-muted-foreground">
        Duration (minutes)
        <NumInput
          className="mt-1"
          min={1}
          value={mins}
          onChange={setMins}
          placeholder="e.g. 20"
          suffix="min"
        />
      </label>

      <button
        type="button"
        onClick={() => setShowRange((v) => !v)}
        className="mt-2 text-xs font-semibold text-primary"
      >
        {showRange ? "Hide exact time range" : "Set exact time range (optional)"}
      </button>

      {showRange ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-muted-foreground">
            From
            <input
              type="time"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full rounded-xl border border-input bg-surface-2 px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            To
            <input
              type="time"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full rounded-xl border border-input bg-surface-2 px-3 py-2 text-sm text-foreground"
            />
          </label>
        </div>
      ) : null}

      <div className="mt-2 flex items-center gap-2">
        {(["Flow State", "Shallow Work"] as Tag[]).map((t) => (
          <Pill key={t} active={tag === t} onClick={() => setTag(t)}>
            <span className="inline-flex items-center gap-1">
              {t === "Flow State" ? <Zap className="h-3 w-3" /> : <Waves className="h-3 w-3" />}
              {t}
            </span>
          </Pill>
        ))}
      </div>
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="What did you work on?"
        className="mt-2 w-full rounded-xl border border-input bg-surface-2 px-3 py-2 text-sm text-foreground"
      />
      <Btn variant="primary" className="mt-2 w-full" onClick={log}>
        <Plus className="h-4 w-4" /> Log session
      </Btn>
      {msg ? <p className="mt-2 text-xs font-semibold text-success">{msg}</p> : null}

      {pickSlot ? (
        <div
          className="celebrate-veil fixed inset-0 z-[60] flex items-end justify-center bg-foreground/50 p-3 backdrop-blur-sm sm:items-center"
          onClick={() => setPickSlot(false)}
        >
          <div
            className="rise max-h-[75vh] w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-popover p-5 shadow-[var(--shadow-glow)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-display text-base font-extrabold text-foreground">
              Which slot does {mins} min belong to?
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Longer entries roll over into the next slots automatically.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {slots
                .filter((s) => !s.disabled)
                .map((s) => {
                  const isNow = s.hour === new Date().getHours();
                  return (
                    <button
                      key={s.slot}
                      type="button"
                      onClick={() => logIntoSlot(s.hour)}
                      className={cn(
                        "press rounded-2xl border px-2 py-2.5 text-center text-xs font-bold transition-colors",
                        isNow
                          ? "gradient-fill border-transparent text-primary-foreground shadow-[var(--shadow-soft)]"
                          : "border-border bg-surface-2 text-foreground hover:border-primary hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      <div>{slotLabel12(s.slot)}</div>
                      <div
                        className={cn(
                          "text-[10px] font-semibold",
                          isNow ? "text-primary-foreground/80" : "text-muted-foreground",
                        )}
                      >
                        {formatHM(s.loggedMins)}
                      </div>
                    </button>
                  );
                })}
            </div>

            <Btn className="mt-3 w-full" onClick={() => setPickSlot(false)}>
              Cancel
            </Btn>
          </div>
        </div>
      ) : null}
    </Card>
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
