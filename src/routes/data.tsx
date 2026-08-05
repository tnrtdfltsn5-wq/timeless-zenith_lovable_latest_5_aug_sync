import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Download, Upload, Copy, AlertTriangle, Wifi, RotateCcw } from "lucide-react";
import {
  STORAGE_KEY,
  backupStats,
  getState,
  mergeBackup,
  parseBackup,
  replaceState,
  todayKey,
  useAppState,
} from "@/lib/store";
import { Btn, Card, SectionTitle, useHydrated } from "@/components/kit";
import { haptic } from "@/lib/alarm";
import { shareTextFile } from "@/lib/share";

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
  const mergeFileRef = useRef<HTMLInputElement>(null);

  const days = Object.keys(state.db).length;
  const logs = Object.values(state.db).reduce((a, d) => a + d.logs.length, 0);

  function backupJson() {
    return JSON.stringify(getState(), null, 2);
  }

  function download() {
    haptic();
    const blob = new Blob([backupJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flow-tracker-backup-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg("Backup file downloaded.");
  }

  async function pushOverWifi() {
    haptic();
    await shareTextFile({
      filename: `flow-tracker-backup-${todayKey()}.json`,
      text: backupJson(),
      title: "Flow Tracker backup",
      mime: "application/json",
    });
    setMsg("Share sheet opened — pick Nearby Share / Quick Share / any app on the same WiFi.");
  }

  function applyImport(text: string, merge: boolean) {
    const incoming = parseBackup(text);
    if (!incoming) {
      setMsg("That file isn't a readable Flow Tracker backup (couldn't find any day data).");
      return;
    }
    const { days: d, logs: l } = backupStats(incoming);
    if (merge) {
      mergeBackup(incoming);
      setMsg(`Merged backup: ${d} day(s), ${l} session(s) considered.`);
    } else {
      replaceState(incoming);
      setMsg(`Data replaced from backup: ${d} day(s), ${l} session(s) restored.`);
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
        <Btn variant="success" className="mt-2 w-full" onClick={pushOverWifi}>
          <Wifi className="h-4 w-4" /> Push to PC / nearby device
        </Btn>
        <Btn
          variant="outline"
          className="mt-2 w-full"
          onClick={() => {
            void navigator.clipboard?.writeText(backupJson());
            setMsg("Backup JSON copied to clipboard.");
          }}
        >
          <Copy className="h-4 w-4" /> Copy JSON to clipboard
        </Btn>
        <p className="mt-2 text-[11px] text-muted-foreground">
          "Push" opens the system share sheet: send the file straight to your PC with Nearby /
          Quick Share, WiFi Direct, or any local-network app — no clipboard needed.
        </p>
      </Card>

      <Card>
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Import / restore
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json,text/plain"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            applyImport(await file.text(), false);
            e.target.value = "";
          }}
        />
        <input
          ref={mergeFileRef}
          type="file"
          accept="application/json,.json,text/plain"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            applyImport(await file.text(), true);
            e.target.value = "";
          }}
        />
        <Btn variant="success" className="mt-2 w-full" onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" /> Restore from file (replace all)
        </Btn>
        <Btn
          variant="outline"
          className="mt-2 w-full"
          onClick={() => mergeFileRef.current?.click()}
        >
          <RotateCcw className="h-4 w-4" /> Merge a file into current data
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
        <p className="mt-2 text-[11px] text-muted-foreground">
          Older exports work too — bare day maps and backups without settings or spends are
          upgraded automatically on import.
        </p>
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
