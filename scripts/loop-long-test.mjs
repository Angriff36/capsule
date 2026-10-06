/**
 * Loop long test — runs a test set that takes longer than one tool call
 * (the 10-minute Bash limit) and keeps it alive when the builder round ends.
 *
 *   bun run --cwd <worktree> C:/Projects/capsule/scripts/loop-long-test.mjs <test files...>
 *
 * The run is keyed by the worktree's HEAD commit plus the file list:
 *   - no run yet       -> starts `bun run test <files>` OUTSIDE the round's process
 *                         tree (Win32_Process Create), so it survives the round;
 *   - run in progress  -> waits up to 9 minutes for it, then prints RUNNING (exit 2);
 *                         call the same command again (this round or the next);
 *   - run finished     -> prints DONE, the log tail and the log path, exits with
 *                         the test run's exit code.
 * A new commit changes the key, so stale results are never reused.
 * Output: <worktree>/.artifacts/long-test/<key>.{log,exit,cmd}.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: loop-long-test.mjs <test files...>");
  process.exit(64);
}
const worktree = process.cwd();
const head = execFileSync("git", ["-C", worktree, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const key = createHash("sha1")
  .update(head + "\n" + [...files].sort().join("\n"))
  .digest("hex")
  .slice(0, 12);
const dir = join(worktree, ".artifacts", "long-test");
mkdirSync(dir, { recursive: true });
const log = join(dir, `${key}.log`);
const exitFile = join(dir, `${key}.exit`);
const cmdFile = join(dir, `${key}.cmd`);

function report() {
  const code = Number.parseInt(readFileSync(exitFile, "utf8").trim(), 10);
  const lines = existsSync(log) ? readFileSync(log, "utf8").split(/\r?\n/) : [];
  console.log(lines.slice(-60).join("\n"));
  console.log(`DONE exit=${code} commit=${head.slice(0, 8)} log=${log}`);
  process.exit(Number.isNaN(code) ? 1 : code);
}

if (existsSync(exitFile)) report();

// A run with no result after 3 hours died (reboot, killed); start it again.
const stale = existsSync(cmdFile) && Date.now() - statSync(cmdFile).mtimeMs > 3 * 60 * 60 * 1000;
if (!existsSync(cmdFile) || stale) {
  writeFileSync(
    cmdFile,
    [
      "@echo off",
      `cd /d "${worktree}"`,
      `call bun run test ${files.map((f) => `"${f}"`).join(" ")} > "${log}" 2>&1`,
      `> "${exitFile}.tmp" echo %errorlevel%`,
      `move /y "${exitFile}.tmp" "${exitFile}" >nul`,
      "",
    ].join("\r\n"),
  );
  // Created through WMI, the run is not a child of this round, so it lives on.
  execFileSync("pwsh", [
    "-NoProfile",
    "-Command",
    `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = 'cmd.exe /c "${cmdFile}"'; CurrentDirectory = '${worktree}' }; if ($r.ReturnValue -ne 0) { exit 1 }`,
  ]);
  console.log(`STARTED commit=${head.slice(0, 8)} log=${log}`);
}

const deadline = Date.now() + 9 * 60 * 1000;
while (Date.now() < deadline) {
  if (existsSync(exitFile)) report();
  await new Promise((r) => setTimeout(r, 15000));
}
const age = Math.round((Date.now() - statSync(cmdFile).mtimeMs) / 60000);
console.log(`RUNNING for ${age} min, commit=${head.slice(0, 8)} log=${log}`);
console.log("Run the same command again for the result (this round or the next).");
process.exit(2);
