/**
 * @deprecated Legacy Manifest CLI layout shim — blocked. Builder emits
 * src/lib/manifest-convex-react.ts directly via bun run manifest:regen.
 */
import { spawnSync } from "node:child_process";

spawnSync(
  "bun",
  [
    "scripts/builder-regen-guard.ts",
    "--deny",
    "place-manifest-convex-react.ts",
  ],
  {
    stdio: "inherit",
  },
);
process.exit(1);
