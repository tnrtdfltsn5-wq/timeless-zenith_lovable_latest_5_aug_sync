import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import {
  computeSlots,
  dayTotals,
  formatHM,
  getDay,
  todayKey,
  useAppState,
} from "@/lib/store";
import { Card, Progress, SectionTitle, useHydrated, useNow } from "@/components/kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/arena")({
  head: () => ({
    meta: [
      { title: "Downtime Warning — Flow Tracker" },
      {
        name: "description",
        content: "Live downtime coefficient showing how far today's focus pace has drifted.",
      },
      { property: "og:title", content: "Downtime Warning — Flow Tracker" },
      {
        property: "og:description",
        content: "A single honest read on your current downtime and required recovery pace.",
      },
    ],
  }),
  component: ArenaPage,
});

function ArenaPage() {
  const state = useAppState();
  const hydrated = useHydrated();
  const now = useNow(5000);
  const nowDate = new Date(now);
  const key = todayKey();
  const day = getDay(state, key);
  const totals = dayTotals(day);
  const coeff = state.settings.coeff;

  const slots = computeSlots(day, key, nowDate);
  const active = slots.filter((s) => !s.disabled);
  const elapsedActive = active.filter((s) => s.hour < nowDate.getHours());
  const expectedByNow = elapsedActive.reduce((a, s) => a + s.targetMins, 0);
  const deficit = Math.max(0, expectedByNow - totals.total);
  const n = expectedByNow > 0 ? Math.min(1, totals.total / expectedByNow) : 1;

  const lastLogEnd = day.logs.reduce((a, l) => Math.max(a, l.end || 0), 0);
  const idleMins = lastLogEnd ? (now - lastLogEnd) / 60000 : elapsedActive.length * 60;
  const breaching = idleMins > coeff.downtimeGraceMins;

  const remainingSlots = active.filter((s) => s.hour >= nowDate.getHours()).length;
  const recoverPace = remainingSlots
    ? Math.max(0, (day.targetHours || 0) * 60 - totals.total) / remainingSlots
    : 0;

  return (
    <div className="space-y-4">
      <SectionTitle>Downtime warning</SectionTitle>

      <Card
        glow
        className={cn(
          "text-center",
          breaching ? "border-destructive" : "border-success/40",
        )}
      >
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold",
            breaching
              ? "bg-destructive text-destructive-foreground"
              : "bg-success text-success-foreground",
          )}
        >
          {breaching ? (
            <AlertTriangle className="h-3.5 w-3.5" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" />
          )}
          {breaching ? "DOWNTIME BREACH" : "PACE HELD"}
        </div>
        <div className="gradient-text mt-3 font-display text-4xl font-extrabold">
          {hydrated ? n.toFixed(2) : "—"}
          <span className="text-base font-bold text-muted-foreground"> / 1.00</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Downtime coefficient (n)</p>
        <Progress className="mt-3" value={n * 100} tone={breaching ? "warning" : "success"} />

        <div className="mt-4 grid grid-cols-2 gap-2 text-left">
          <Box label="Idle since last log" value={hydrated ? formatHM(idleMins) : "—"} />
          <Box label="Grace window" value={formatHM(coeff.downtimeGraceMins)} />
          <Box label="Expected by now" value={formatHM(expectedByNow)} />
          <Box label="Deficit" value={formatHM(deficit)} danger={deficit > 0} />
        </div>

        <div className="mt-3 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground">
          Recovery pace: {formatHM(recoverPace)} per remaining active slot
        </div>
      </Card>
    </div>
  );
}

function Box({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn("font-display text-sm font-bold", danger && "text-destructive")}
      >
        {value}
      </div>
    </div>
  );
}
