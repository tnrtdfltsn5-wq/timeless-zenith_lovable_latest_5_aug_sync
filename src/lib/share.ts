import { Capacitor } from "@capacitor/core";

type ShareReportOpts = {
  filename: string;
  html: string;
  title: string;
};

/**
 * Share a self-contained HTML report to a nearby device.
 *
 * - Native Android (Capacitor): writes the report to app cache and opens the
 *   system share sheet. From there the user can pick Nearby Share / WiFi Direct /
 *   Quick Share / Bluetooth / any messaging app to push it to another device on
 *   the local network — no internet required.
 * - Browser with Web Share (file) support: uses the native share sheet with the
 *   file attached.
 * - Everything else: falls back to a normal file download.
 */
export async function shareReportOverWifi({ filename, html, title }: ShareReportOpts) {
  // Native path (the APK) — richest local-transfer options.
  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");

      await Filesystem.writeFile({
        path: filename,
        data: html,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      const { uri } = await Filesystem.getUri({
        path: filename,
        directory: Directory.Cache,
      });

      await Share.share({
        title,
        text: title,
        url: uri,
        dialogTitle: "Send report to a nearby device",
      });
      return;
    } catch (err) {
      // If sharing is cancelled or unavailable, fall through to browser fallbacks.
      console.log("[v0] native share failed, falling back:", (err as Error)?.message);
    }
  }

  // Browser: try Web Share with an attached file (works on most mobile browsers).
  try {
    const file = new File([html], filename, { type: "text/html" });
    const nav = navigator as Navigator & {
      canShare?: (data?: unknown) => boolean;
      share?: (data: unknown) => Promise<void>;
    };
    if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
      await nav.share({ title, text: title, files: [file] });
      return;
    }
  } catch (err) {
    console.log("[v0] web share failed, falling back to download:", (err as Error)?.message);
  }

  // Last resort: download the file.
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
