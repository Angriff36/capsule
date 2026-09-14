/**
 * Run a repo bash script with Git Bash on Windows, never the WSL stub
 * (C:\\Windows\\System32\\bash.exe) that fails when no distro is installed.
 * Issue #338.
 */
import { spawnSync } from "node:child_process";
import { WindowsGitBashPath } from "./windowsGitBashPath.ts";

const script = process.argv[2];
if (!script) {
  console.error("usage: bun scripts/run-bash.ts <script.sh> [args…]");
  process.exit(2);
}
const gitBash = new WindowsGitBashPath();
gitBash.prependToPath();
const exe = gitBash.resolveExe();
const bash =
  process.platform === "win32"
    ? (exe ??
      (() => {
        throw new Error(
          "Git Bash was not found. Install Git for Windows or set GIT_BASH to bash.exe.",
        );
      })())
    : "bash";
const result = spawnSync(bash, [script, ...process.argv.slice(3)], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
