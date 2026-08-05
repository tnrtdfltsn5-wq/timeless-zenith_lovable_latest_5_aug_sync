import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.timelesszenith",
  appName: "Flow Tracker",
  // TanStack Start SPA mode emits the static client into dist/client.
  // A postbuild step copies _shell.html -> index.html so Capacitor has an entry point.
  webDir: "dist/client",
  android: {
    // Serves the bundled assets from the app's own origin (offline, no network needed).
    allowMixedContent: false,
  },
};

export default config;
