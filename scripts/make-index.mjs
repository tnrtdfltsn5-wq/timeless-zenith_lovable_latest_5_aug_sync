// TanStack Start SPA mode emits dist/client/_shell.html as the app entry.
// Capacitor (and static hosts) expect index.html, so copy it into place.
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve("dist/client");
const shell = resolve(dir, "_shell.html");
const index = resolve(dir, "index.html");

if (!existsSync(shell)) {
  console.error("[cap:shell] dist/client/_shell.html not found. Run the build first.");
  process.exit(1);
}
copyFileSync(shell, index);
console.log("[cap:shell] wrote dist/client/index.html");
