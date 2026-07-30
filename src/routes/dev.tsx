import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import {
  DEFAULT_COEFF,
  TAGS,
  computeDayScore,
  computeSlotScore,
  computeSlots,
  dayTotals,
  slotFactorOf,
  slotLabel12,
  slotNFactor,
  taskRatioOf,

  formatHM,
  getDay,
  setState,
  todayKey,
  useAppState,
  type Coefficients,
} from "@/lib/store";
import { Btn, Card, SectionTitle, useHydrated } from "@/components/kit";
import { haptic } from "@/lib/alarm";

export const Route = createFileRoute("/dev")({
  head: () => ({
    meta: [
      { title: "Engine Settings — Flow Tracker" },
      {
        name: "description",
        content:
          "Tune scoring coefficients, slot distribution rules, tags and alert behaviour without code.",
      },
      { property: "og:title", content: "Engine Settings — Flow Tracker" },
      {
        property: "og:description",
        content: "No-code control panel for scoring weights, slot maths and alert behaviour.",
      },
    ],
  }),
  component: DevPage,
});

const FIELDS: { key: keyof Coefficients; label: string; step: number; help: string }[] = [
  {
    key: "flowRate",
    label: "Flow State points / hour",
    step: 10,
    help: "Base rate for flow-state hours (formula: T×rate×(1+n)×S).",
  },
  {
    key: "shallowRate",
    label: "Shallow Work points / hour",
    step: 10,
    help: "Base rate for shallow hours (formula: T×rate×(1+n/2)).",
  },
  {
    key: "lateFactor",
    label: "S factor when overrunning",
    step: 0.05,
    help: "Multiplier applied when a slotted task isn't finished inside its window.",
  },

  {
    key: "downtimeGraceMins",
    label: "Downtime grace (mins)",
    step: 5,
    help: "Idle minutes allowed before the downtime warning fires.",
  },
  {
    key: "minSlotTargetMins",
    label: "Minimum slot target (mins)",
    step: 5,
    help: "Floor applied when auto-distributing remaining target.",
  },
];

function DevPage() {
  const state = useAppState();
  const hydrated = useHydrated();
  const coeff = state.settings.coeff;
  const key = todayKey();
  const day = getDay(state, key);
  const totals = dayTotals(day);
  const now = new Date();
  const slots = computeSlots(day, key, now);
  const activeSlots = slots.filter((s) => !s.disabled);
  const future = activeSlots.filter((s) => s.hour >= now.getHours());

  return (
    <div className="space-y-4">
      <SectionTitle>Engine settings</SectionTitle>

      <Card>
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Scoring & distribution variables
        </div>
        <div className="mt-2 space-y-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="text-xs font-semibold">{f.label}</span>
              <input
                type="number"
                step={f.step}
                value={coeff[f.key]}
                onChange={(e) =>
                  setState((s) => {
                    s.settings.coeff[f.key] = Number(e.target.value) || 0;
                  })
                }
                className="mt-1 w-full rounded-xl border border-input bg-surface-2 px-3 py-2 text-sm"
              />
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{f.help}</span>
            </label>
          ))}
        </div>
        <Btn
          variant="outline"
          className="mt-3 w-full"
          onClick={() => {
            haptic();
            setState((s) => {
              s.settings.coeff = { ...DEFAULT_COEFF };
            });
          }}
        >
          <RotateCcw className="h-4 w-4" /> Reset to defaults
        </Btn>
      </Card>

      <Card>
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Alerts
        </div>
        <label className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold">
          Phase-change sound & vibration
          <button
            onClick={() =>
              setState((s) => {
                s.settings.soundOn = !s.settings.soundOn;
              })
            }
            className={`press h-6 w-11 rounded-full transition-colors ${
              state.settings.soundOn ? "bg-success" : "bg-secondary"
            }`}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-background transition-transform ${
                state.settings.soundOn ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </label>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Slot popups and panic alerts are permanently disabled — only pomodoro phase changes
          alert you.
        </p>
      </Card>

      <Card>
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Tags
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {TAGS.map((t) => (
            <span key={t} className="rounded-full bg-accent px-3 py-1 text-xs font-semibold">
              {t}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Fixed set — everything logs as flow state or shallow work.
        </p>
      </Card>

      <Card>
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Live calculation trace (today)
        </div>
        <dl className="mt-2 space-y-1 font-mono text-[11px]">
          <Row k="daily target" v={formatHM((day.targetHours || 0) * 60)} />
          <Row k="logged total" v={hydrated ? formatHM(totals.total) : "—"} />
          <Row k="flow / shallow" v={`${formatHM(totals.flow)} / ${formatHM(totals.shallow)}`} />
          <Row k="active slots" v={`${activeSlots.length} of 24`} />
          <Row k="remaining slots" v={String(future.length)} />
          <Row
            k="auto target per slot"
            v={formatHM(future.length ? future.reduce((a, s) => a + s.targetMins, 0) / future.length : 0)}
          />
          <Row k="task ratio n" v={taskRatioOf(day).toFixed(3)} />
          <Row k="slot factor S" v={slotFactorOf(day, coeff).toFixed(2)} />
          <Row k="day points" v={Math.round(computeDayScore(day, coeff)).toLocaleString()} />
          <Row k="score goal" v={state.settings.scoreTarget.toFixed(0)} />

        </dl>
      </Card>

      <Card>
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Per-slot n-factor & score (today)
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Exception rules: 6–9AM slots use n=2, first 5 slots from 6AM use n=1, others use the day task ratio.
        </p>
        <div className="mt-2 max-h-64 overflow-y-auto space-y-1 font-mono text-[11px]">
          {activeSlots.map((s) => (
            <Row
              key={s.slot}
              k={slotLabel12(s.slot)}
              v={`n=${slotNFactor(s.slot, day)} · ${Math.round(
                computeSlotScore(s.slot, s.logs, day, coeff),
              )} pts`}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/60 pb-1">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}
