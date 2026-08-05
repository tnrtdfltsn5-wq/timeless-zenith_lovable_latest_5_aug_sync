import { Capacitor } from "@capacitor/core";

type ShareFileOpts = {
  filename: string;
  text: string;
  title: string;
  mime?: string;
};

/**
 * Share a self-contained text file (report HTML, JSON backup…) to a nearby
 * device over the local network.
 *
 * - Native Android (Capacitor): writes the file to app cache and opens the
 *   system share sheet — Nearby Share / Quick Share / WiFi Direct / any app.
 * - Browser with Web Share (file) support: native share sheet with the file.
 * - Everything else: plain download.
 */
export async function shareTextFile({ filename, text, title, mime = "text/plain" }: ShareFileOpts) {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");

      await Filesystem.writeFile({
        path: filename,
        data: text,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });

      await Share.share({ title, text: title, url: uri, dialogTitle: "Send to a nearby device" });
      return;
    } catch (err) {
      console.log("[share] native share failed, falling back:", (err as Error)?.message);
    }
  }

  try {
    const file = new File([text], filename, { type: mime });
    const nav = navigator as Navigator & {
      canShare?: (data?: unknown) => boolean;
      share?: (data: unknown) => Promise<void>;
    };
    if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
      await nav.share({ title, text: title, files: [file] });
      return;
    }
  } catch (err) {
    console.log("[share] web share failed, falling back to download:", (err as Error)?.message);
  }

  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Backwards-compatible helper used by the report page. */
export async function shareReportOverWifi({
  filename,
  html,
  title,
}: {
  filename: string;
  html: string;
  title: string;
}) {
  return shareTextFile({ filename, text: html, title, mime: "text/html" });
}
