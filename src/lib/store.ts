import { useSyncExternalStore } from "react";

/* ---------------- Types ---------------- */

export type Tag = "Flow State" | "Shallow Work";
export const TAGS: Tag[] = ["Flow State", "Shallow Work"];

export type BreakTag = "Essential" | "Rest" | "Sleep" | "Entertainment";
export const BREAK_TAGS: BreakTag[] = ["Essential", "Rest", "Sleep", "Entertainment"];

export interface LogEntry {
  id: number;
  durationMins: number;
  tag: Tag;
  desc: string;
  timeRange: string;
  slotHour: string;
  start: number;
  end: number;
}

export interface BreakEntry {
  id: number;
  tag: BreakTag;
  start: number;
  end: number;
  mins: number;
  slotHour: string;
}

export interface SubTask {
  id: number;
  name: string;
  completed: boolean;
}

export interface Task {
  id: number;
  name: string;
  completed: boolean;
  comment?: string;
  subtasks?: SubTask[];
  /** optional deadline window expressed as hour numbers (0-23) */
  fromHour?: number | null;
  toHour?: number | null;
  /** planned minutes for the whole task, split evenly across subtasks */
  plannedMins?: number | null;
}

export interface SlotTodo {
  id: number;
  text: string;
}

export interface DayData {
  targetHours: number;
  tasks: Task[];
  logs: LogEntry[];
  breaks: BreakEntry[];
  slotTargets: Record<string, number>;
  slotAssignments: Record<string, string>;
  /** multiple task ids attached to one slot */
  slotTaskIds: Record<string, number[]>;
  slotNotes: Record<string, string>;
  slotTodos: Record<string, SlotTodo[]>;
  disabledSlots: string[];
  scoreAdjust?: number;
}


export interface Spend {
  id: number;
  date: string;
  reason: string;
  amount: number;
}

export interface Coefficients {
  pointsPerHour: number;
  timeWeight: number;
  taskWeight: number;
  flowBonus: number;
  minSlotTargetMins: number;
  downtimeGraceMins: number;
  dayStartHour: number;
  dayEndHour: number;
}

export interface Settings {
  theme: string;
  dark: boolean;
  pomoWork: number;
  pomoBreak: number;
  soundOn: boolean;
  coeff: Coefficients;
}

export interface TimerState {
  running: boolean;
  paused: boolean;
  mode: "stopwatch" | "pomodoro";
  startTime: number | null;
  accumulatedSeconds: number;
  sessionStart: number | null;
  tag: Tag;
  pomoPhase: "work" | "break";
  pomoRemainingSecs: number;
  pomoElapsedWorkSecs: number;
  /** when the timer last stopped / the user last left — used to log idle as a break */
  idleSince: number | null;
}


export interface AppState {
  db: Record<string, DayData>;
  spends: Spend[];
  settings: Settings;
  timer: TimerState;
  lastSession: { start: number; end: number; mins: number } | null;
  lastSeen: number;
}

/* ---------------- Defaults ---------------- */

export const DEFAULT_COEFF: Coefficients = {
  pointsPerHour: 300,
  timeWeight: 0.5,
  taskWeight: 0.5,
  flowBonus: 0.15,
  minSlotTargetMins: 0,
  downtimeGraceMins: 45,
  dayStartHour: 0,
  dayEndHour: 24,
};

const defaultTimer: TimerState = {
  running: false,
  paused: false,
  mode: "stopwatch",
  startTime: null,
  accumulatedSeconds: 0,
  sessionStart: null,
  tag: "Flow State",
  pomoPhase: "work",
  pomoRemainingSecs: 25 * 60,
  pomoElapsedWorkSecs: 0,
  idleSince: null,

};

const defaultState: AppState = {
  db: {},
  spends: [],
  settings: {
    theme: "indigo",
    dark: true,
    pomoWork: 25,
    pomoBreak: 5,
    soundOn: true,
    coeff: { ...DEFAULT_COEFF },
  },
  timer: { ...defaultTimer },
  lastSession: null,
  lastSeen: 0,
};

export const STORAGE_KEY = "flow_tracker_v2";

/* ---------------- Time helpers ---------------- */

export function dateKeyOf(d: Date | number): string {
  const dt = typeof d === "number" ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function todayKey() {
  return dateKeyOf(new Date());
}

export function slotKeyOfHour(h: number) {
  return `${String(h).padStart(2, "0")}:00 - ${String(h + 1).padStart(2, "0")}:00`;
}

export const ALL_SLOTS = Array.from({ length: 24 }, (_, h) => slotKeyOfHour(h));

export function slotHourNumber(slot: string) {
  return parseInt(slot.slice(0, 2), 10);
}

export function formatHM(totalMins: number) {
  if (!totalMins || totalMins <= 0) return "0m";
  const h = Math.floor(totalMins / 60);
  const m = Math.round(totalMins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatClock(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDuration(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ---------------- Store ---------------- */

let state: AppState = defaultState;
const listeners = new Set<() => void>();

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export function getState() {
  return state;
}

export function setState(mutate: (draft: AppState) => void) {
  const next: AppState = JSON.parse(JSON.stringify(state));
  mutate(next);
  state = next;
  persist();
  emit();
}

export function replaceState(next: AppState) {
  state = normalize(next);
  persist();
  emit();
}

function normalize(raw: Partial<AppState>): AppState {
  const s: AppState = {
    ...defaultState,
    ...raw,
    settings: {
      ...defaultState.settings,
      ...(raw.settings ?? {}),
      coeff: { ...DEFAULT_COEFF, ...(raw.settings?.coeff ?? {}) },
    },
    timer: { ...defaultTimer, ...(raw.timer ?? {}) },
    db: raw.db ?? {},
    spends: raw.spends ?? [],
  };
  for (const key of Object.keys(s.db)) {
    const d = s.db[key];
    s.db[key] = {
      targetHours: d.targetHours ?? 6,
      tasks: (d.tasks ?? []).map((t) => ({ ...t, subtasks: (t.subtasks ?? []).map((x) => ({ ...x })) })),
      logs: (d.logs ?? []).map((l) => ({ ...l })),
      breaks: (d.breaks ?? []).map((b) => ({ ...b })),
      slotTargets: d.slotTargets ?? {},
      slotAssignments: d.slotAssignments ?? {},
      slotTaskIds: d.slotTaskIds ?? {},
      slotNotes: d.slotNotes ?? {},
      slotTodos: d.slotTodos ?? {},
      disabledSlots: d.disabledSlots ?? [],
      scoreAdjust: d.scoreAdjust ?? 0,
    };
  }

  return s;
}

let hydrated = false;
export function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = normalize(JSON.parse(raw));
    } else {
      // migrate from legacy single-file app if present
      const legacy = window.localStorage.getItem("flow_tracker_db");
      if (legacy) {
        state = normalize({ ...defaultState, db: JSON.parse(legacy) });
      }
    }
  } catch {
    state = defaultState;
  }
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, () => defaultState);
}

/* ---------------- Day access ---------------- */

export function blankDay(): DayData {
  return {
    targetHours: 6,
    tasks: [],
    logs: [],
    slotTargets: {},
    slotAssignments: {},
    disabledSlots: [],
    scoreAdjust: 0,
  };
}

export function getDay(s: AppState, key: string): DayData {
  return s.db[key] ?? blankDay();
}

export function editDay(key: string, mutate: (d: DayData) => void) {
  setState((s) => {
    if (!s.db[key]) s.db[key] = blankDay();
    mutate(s.db[key]);
  });
}

/* ---------------- Session splitting ---------------- */

export interface Segment {
  dateKey: string;
  slotHour: string;
  start: number;
  end: number;
  mins: number;
}

/** Split a real session into per-hour-slot segments (e.g. 2:55–3:10 -> 5m + 10m). */
export function splitSession(start: number, end: number): Segment[] {
  const segs: Segment[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor < end && guard++ < 500) {
    const d = new Date(cursor);
    const boundary = new Date(d);
    boundary.setMinutes(0, 0, 0);
    boundary.setHours(d.getHours() + 1);
    const segEnd = Math.min(end, boundary.getTime());
    const mins = (segEnd - cursor) / 60000;
    if (mins > 0.004) {
      segs.push({
        dateKey: dateKeyOf(cursor),
        slotHour: slotKeyOfHour(new Date(cursor).getHours()),
        start: cursor,
        end: segEnd,
        mins: Math.round(mins * 100) / 100,
      });
    }
    cursor = segEnd;
  }
  return segs;
}

export function addSession(start: number, end: number, tag: Tag, desc: string) {
  const segs = splitSession(start, end);
  if (!segs.length) return;
  setState((s) => {
    segs.forEach((seg, i) => {
      if (!s.db[seg.dateKey]) s.db[seg.dateKey] = blankDay();
      s.db[seg.dateKey].logs.push({
        id: Date.now() + i,
        durationMins: seg.mins,
        tag,
        desc: desc || "Focus session",
        timeRange: `${formatClock(seg.start)} — ${formatClock(seg.end)}`,
        slotHour: seg.slotHour,
        start: seg.start,
        end: seg.end,
      });
    });
    s.lastSession = { start, end, mins: (end - start) / 60000 };
  });
}

/* ---------------- Slot target distribution ---------------- */

export interface SlotInfo {
  slot: string;
  hour: number;
  disabled: boolean;
  targetMins: number;
  loggedMins: number;
  remainingMins: number;
  progress: number;
  explicit: boolean;
  assignment: string;
  logs: LogEntry[];
}

/**
 * Recalculates slot targets. Explicit targets are honoured. The remaining daily
 * target is distributed only across enabled, non-explicit slots that are still
 * ahead (>= current hour when viewing today). Past slots keep an even baseline.
 */
export function computeSlots(day: DayData, dateKey: string, now: Date): SlotInfo[] {
  const isToday = dateKey === dateKeyOf(now);
  const currentHour = isToday ? now.getHours() : 24;
  const dailyTargetMins = (day.targetHours || 0) * 60;
  const disabled = new Set(day.disabledSlots);

  const loggedBySlot: Record<string, LogEntry[]> = {};
  day.logs.forEach((l) => {
    (loggedBySlot[l.slotHour] ??= []).push(l);
  });
  const minsOf = (slot: string) =>
    (loggedBySlot[slot] ?? []).reduce((a, b) => a + b.durationMins, 0);

  const totalLogged = day.logs.reduce((a, b) => a + b.durationMins, 0);
  const enabled = ALL_SLOTS.filter((s) => !disabled.has(s));

  const futureAuto: string[] = [];
  let explicitFutureMins = 0;
  enabled.forEach((slot) => {
    const h = slotHourNumber(slot);
    if (h < currentHour) return;
    if (day.slotTargets[slot] !== undefined) explicitFutureMins += day.slotTargets[slot] * 60;
    else futureAuto.push(slot);
  });

  const remainingTarget = Math.max(0, dailyTargetMins - totalLogged - explicitFutureMins);
  const perAutoSlot = futureAuto.length ? remainingTarget / futureAuto.length : 0;
  const baseline = enabled.length ? dailyTargetMins / enabled.length : 0;

  return ALL_SLOTS.map((slot) => {
    const hour = slotHourNumber(slot);
    const isDisabled = disabled.has(slot);
    const explicit = day.slotTargets[slot] !== undefined;
    let targetMins = 0;
    if (isDisabled) targetMins = 0;
    else if (explicit) targetMins = day.slotTargets[slot] * 60;
    else if (hour >= currentHour) targetMins = perAutoSlot;
    else targetMins = baseline;

    const loggedMins = minsOf(slot);
    return {
      slot,
      hour,
      disabled: isDisabled,
      targetMins: Math.round(targetMins * 10) / 10,
      loggedMins,
      remainingMins: Math.max(0, targetMins - loggedMins),
      progress: targetMins > 0 ? Math.min(100, (loggedMins / targetMins) * 100) : 0,
      explicit,
      assignment: day.slotAssignments[slot] ?? "",
      logs: (loggedBySlot[slot] ?? []).sort((a, b) => a.start - b.start),
    };
  });
}

/* ---------------- Scoring ---------------- */

export function dayTotals(day: DayData) {
  let total = 0;
  let flow = 0;
  let shallow = 0;
  day.logs.forEach((l) => {
    total += l.durationMins;
    if (l.tag === "Flow State") flow += l.durationMins;
    else shallow += l.durationMins;
  });
  return { total, flow, shallow };
}

export function computeDayScore(day: DayData | undefined, coeff: Coefficients): number {
  if (!day) return 0;
  const { total, flow } = dayTotals(day);
  const hours = total / 60;
  const target = day.targetHours || 6;
  const timeRatio = Math.min(1, target > 0 ? hours / target : 0);
  const tasks = day.tasks ?? [];
  const taskRatio = tasks.length ? tasks.filter((t) => t.completed).length / tasks.length : 1;
  const n = Math.min(
    1,
    Math.max(0, coeff.timeWeight * timeRatio + coeff.taskWeight * taskRatio),
  );
  const flowRatio = total > 0 ? flow / total : 0;
  const base = hours * coeff.pointsPerHour * n * (1 + coeff.flowBonus * flowRatio);
  return base + (day.scoreAdjust ?? 0);
}

export function lifetimeScores(s: AppState) {
  let gross = 0;
  let month = 0;
  const prefix = todayKey().slice(0, 7);
  for (const key of Object.keys(s.db)) {
    const sc = computeDayScore(s.db[key], s.settings.coeff);
    gross += sc;
    if (key.startsWith(prefix)) month += sc;
  }
  const spent = s.spends.reduce((a, b) => a + b.amount, 0);
  return { gross, month, spent, net: gross - spent };
}
