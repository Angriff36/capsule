/**
 * Deny-guard shim for Builder-emitted `manifest:build`.
 * Bare `manifest build` bypasses Builder ownership — use `bun run manifest:regen`.
 */
import { spawnSync } from "node:child_process";

spawnSync(
  "bun",
  ["scripts/builder-regen-guard.ts", "--deny", "manifest:build"],
  {
    stdio: "inherit",
  },
);
process.exit(1);
