/**
 * Run a repo bash script with Git Bash on Windows, never the WSL stub
 * (C:\\Windows\\System32\\bash.exe) that fails when no distro is installed.
 * Issue #338.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

class WindowsGitBashResolver {
  resolve(): string {
    const fromEnv = process.env.GIT_BASH?.trim();
    if (fromEnv && existsSync(fromEnv)) return fromEnv;
    const candidates = [
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    ];
    for (const path of candidates) {
      if (existsSync(path)) return path;
    }
    throw new Error(
      "Git Bash was not found. Install Git for Windows or set GIT_BASH to bash.exe.",
    );
  }
}

const script = process.argv[2];
if (!script) {
  console.error("usage: bun scripts/run-bash.ts <script.sh> [args…]");
  process.exit(2);
}
const bash =
  process.platform === "win32"
    ? new WindowsGitBashResolver().resolve()
    : "bash";
const result = spawnSync(bash, [script, ...process.argv.slice(3)], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
