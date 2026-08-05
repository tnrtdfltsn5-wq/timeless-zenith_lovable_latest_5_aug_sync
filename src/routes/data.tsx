import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Download, Upload, Copy, AlertTriangle } from "lucide-react";
import { STORAGE_KEY, getState, replaceState, todayKey, useAppState, type AppState } from "@/lib/store";
import { Btn, Card, SectionTitle, useHydrated } from "@/components/kit";
import { haptic } from "@/lib/alarm";

export const Route = createFileRoute("/data")({
  head: () => ({
    meta: [
      { title: "Backup, Export & Import — Flow Tracker" },
      {
        name: "description",
        content: "Export your full tracking history to a file and restore it on any device.",
      },
      { property: "og:title", content: "Backup, Export & Import — Flow Tracker" },
      {
        property: "og:description",
        content: "Never lose data: JSON export and import across browsers and devices.",
      },
    ],
  }),
  component: DataPage,
});

function DataPage() {
  const state = useAppState();
  const hydrated = useHydrated();
  const [msg, setMsg] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const days = Object.keys(state.db).length;
  const logs = Object.values(state.db).reduce((a, d) => a + d.logs.length, 0);

  function download() {
    haptic();
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flow-tracker-backup-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg("Backup file downloaded.");
  }

  function applyImport(text: string, merge: boolean) {
    try {
      const incoming = JSON.parse(text) as AppState;
      if (!incoming || typeof incoming !== "object" || !incoming.db) throw new Error("bad file");
      if (merge) {
        const current = getState();
        const db = { ...current.db };
        for (const key of Object.keys(incoming.db)) {
          const a = db[key];
          const b = incoming.db[key];
          if (!a) db[key] = b;
          else {
            const ids = new Set(a.logs.map((l) => l.id));
            db[key] = {
              ...a,
              ...b,
              logs: [...a.logs, ...b.logs.filter((l) => !ids.has(l.id))],
              tasks: a.tasks.length ? a.tasks : b.tasks,
              slotTargets: { ...b.slotTargets, ...a.slotTargets },
              slotAssignments: { ...b.slotAssignments, ...a.slotAssignments },
              disabledSlots: Array.from(new Set([...a.disabledSlots, ...b.disabledSlots])),
            };
          }
        }
        const spendIds = new Set(current.spends.map((s) => s.id));
        replaceState({
          ...current,
          db,
          spends: [...current.spends, ...incoming.spends.filter((s) => !spendIds.has(s.id))],
        });
        setMsg("Backup merged into current data.");
      } else {
        replaceState(incoming);
        setMsg("Data replaced from backup.");
      }
    } catch {
      setMsg("That file isn't a valid Flow Tracker backup.");
    }
  }

  return (
    <div className="space-y-4">
      <SectionTitle>Backup & restore</SectionTitle>

      <Card>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="text-[11px] text-muted-foreground">Days tracked</div>
            <div className="font-display text-lg font-bold">{hydrated ? days : "—"}</div>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="text-[11px] text-muted-foreground">Sessions logged</div>
            <div className="font-display text-lg font-bold">{hydrated ? logs : "—"}</div>
          </div>
        </div>
        <Btn className="mt-3 w-full" onClick={download}>
          <Download className="h-4 w-4" /> Export backup file
        </Btn>
        <Btn
          variant="outline"
          className="mt-2 w-full"
          onClick={() => {
            void navigator.clipboard?.writeText(JSON.stringify(getState()));
            setMsg("Backup JSON copied to clipboard.");
          }}
        >
          <Copy className="h-4 w-4" /> Copy JSON to clipboard
        </Btn>
      </Card>

      <Card>
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Import
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            applyImport(await file.text(), false);
            e.target.value = "";
          }}
        />
        <Btn variant="success" className="mt-2 w-full" onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" /> Import file (replace all)
        </Btn>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="…or paste backup JSON here"
          className="mt-3 h-28 w-full rounded-xl border border-input bg-surface-2 p-3 font-mono text-xs outline-none focus:border-ring"
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Btn variant="ghost" onClick={() => applyImport(pasted, true)}>
            Merge
          </Btn>
          <Btn variant="danger" onClick={() => applyImport(pasted, false)}>
            Replace
          </Btn>
        </div>
      </Card>

      {msg ? (
        <div className="surface-card flex items-start gap-2 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>{msg}</span>
        </div>
      ) : null}

      <p className="px-1 text-[11px] text-muted-foreground">
        Data lives in this browser under <code className="font-mono">{STORAGE_KEY}</code>. Export
        before switching browser or device.
      </p>
    </div>
  );
}
