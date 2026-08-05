import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import {
  computeDayScore,
  formatHM,
  formatDateDMY,
  dayTotals,
  getDay,
  lifetimeScores,
  setState,
  editDay,
  todayKey,
  useAppState,
} from "@/lib/store";
import { Btn, Card, DateInput, SectionTitle, Stat, inputClass, useHydrated } from "@/components/kit";
import { haptic } from "@/lib/alarm";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/score")({
  head: () => ({
    meta: [
      { title: "Score & Ledger — Flow Tracker" },
      {
        name: "description",
        content: "Daily, monthly and lifetime focus scores with an editable redemption ledger.",
      },
      { property: "og:title", content: "Score & Ledger — Flow Tracker" },
      {
        property: "og:description",
        content: "Track earned focus points, adjust past days and redeem rewards.",
      },
    ],
  }),
  component: ScorePage,
});

function ScorePage() {
  const state = useAppState();
  const hydrated = useHydrated();
  const [activeDate, setActiveDate] = useState(todayKey());
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");

  const day = getDay(state, activeDate);
  const dayScore = computeDayScore(state.db[activeDate], state.settings.coeff);
  const { month, net, gross, spent } = lifetimeScores(state);

  return (
    <div className="space-y-4">
      <SectionTitle>Scores & ledger</SectionTitle>

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Selected day"
          value={hydrated ? dayScore.toFixed(0) : "—"}
          sub={formatHM(dayTotals(day).total)}
          tone="primary"
        />
        <Stat label="This month" value={hydrated ? month.toFixed(0) : "—"} />
        <Stat label="Gross lifetime" value={hydrated ? gross.toFixed(0) : "—"} />
        <Stat
          label="Net after redemptions"
          value={hydrated ? net.toFixed(0) : "—"}
          sub={`${spent.toFixed(0)} redeemed`}
          tone="success"
        />
      </div>

      <Card>
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Daily score goal
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          This target drives the score progress bar on the Timer page.
        </p>
        <label className="mt-2 block text-xs font-semibold text-muted-foreground">
          Score target (points)
          <input
            type="number"
            min={0}
            step={50}
            value={state.settings.scoreTarget}
            onChange={(e) =>
              setState((s) => {
                s.settings.scoreTarget = Math.max(0, Number(e.target.value) || 0);
              })
            }
            className={cn(inputClass, "mt-1")}
          />
        </label>
        <div className="mt-2 flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>Today's progress</span>
          <span className="text-foreground">
            {hydrated ? dayScore.toFixed(0) : "—"} / {state.settings.scoreTarget.toFixed(0)} pts
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="gradient-fill h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${Math.min(100, (dayScore / (state.settings.scoreTarget || 1)) * 100)}%`,
            }}
          />
        </div>
      </Card>

      <Card>
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Edit a past day
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-muted-foreground">
            Date
            <DateInput className="mt-1 w-full" value={activeDate} onChange={setActiveDate} />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Target hours
            <input
              type="number"
              step={0.5}
              value={day.targetHours}
              onChange={(e) =>
                editDay(activeDate, (d) => {
                  d.targetHours = Math.max(0, Number(e.target.value) || 0);
                })
              }
              className={cn(inputClass, "mt-1")}
            />
          </label>
        </div>
        <label className="mt-3 block text-xs font-semibold text-muted-foreground">
          Manual score adjustment (+/-)
          <input
            type="number"
            value={day.scoreAdjust ?? 0}
            onChange={(e) =>
              editDay(activeDate, (d) => {
                d.scoreAdjust = Number(e.target.value) || 0;
              })
            }
            className={cn(inputClass, "mt-1")}
          />
        </label>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Adjustments apply on top of the computed score for that date.
        </p>
      </Card>

      <Card>
        <div className="text-[11px] font-semibold tracking-wide text-warning uppercase">
          Redeem score
        </div>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <input
            className={inputClass}
            placeholder="Points"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            className={inputClass}
            placeholder="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <Btn
          variant="warning"
          className="mt-2 w-full"
          onClick={() => {
            const val = Number(amount);
            if (!val) return;
            haptic();
            setState((s) => {
              s.spends.push({
                id: Date.now(),
                date: todayKey(),
                reason: reason.trim() || "Reward",
                amount: val,
              });
            });
            setAmount("");
            setReason("");
          }}
        >
          Deduct points
        </Btn>
      </Card>

      <div className="space-y-2">
        <h3 className="text-sm font-bold">Redemption history</h3>
        {hydrated && state.spends.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing redeemed yet.</p>
        ) : null}
        {state.spends
          .slice()
          .reverse()
          .map((s) => (
            <div
              key={s.id}
              className="surface-card grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-3"
            >
              <div className="min-w-0 text-xs">
                <div className="truncate font-semibold">{s.reason}</div>
                <div className="text-muted-foreground">{formatDateDMY(s.date)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {editId === s.id ? (
                  <>
                    <input
                      type="number"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="w-20 rounded-lg border border-input bg-surface-2 px-2 py-1 text-xs"
                    />
                    <button
                      onClick={() => {
                        setState((st) => {
                          const item = st.spends.find((x) => x.id === s.id);
                          if (item) item.amount = Number(editAmount) || 0;
                        });
                        setEditId(null);
                      }}
                      className="press grid h-7 w-7 place-items-center rounded-lg bg-success text-success-foreground"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="font-display text-sm font-bold text-destructive">
                      -{s.amount}
                    </span>
                    <button
                      onClick={() => {
                        setEditId(s.id);
                        setEditAmount(String(s.amount));
                      }}
                      className="press grid h-7 w-7 place-items-center rounded-lg bg-secondary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                <button
                  onClick={() =>
                    setState((st) => {
                      st.spends = st.spends.filter((x) => x.id !== s.id);
                    })
                  }
                  className="press grid h-7 w-7 place-items-center rounded-lg bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
