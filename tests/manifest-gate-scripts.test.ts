/**
 * The Manifest gate scripts must run where only git and the JS runtime exist
 * (Windows PowerShell has no mkdir -p / tar on PATH by default, and
 * node_modules/.bin/manifest is a .cmd/.exe shim there). Review of PR #403.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { materializeBaseline } from "../scripts/check-manifest-breaking";
import { manifestCliEntry, runManifestCli } from "../scripts/manifest-cli";

const ROOT = path.resolve(__dirname, "..");
const scratch: string[] = [];
const originalPath = process.env.PATH;

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "manifest-gate-"));
  scratch.push(dir);
  return dir;
}

afterEach(() => {
  process.env.PATH = originalPath;
  for (const dir of scratch.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("Manifest gate scripts without Unix tools", () => {
  // POSIX-only harness (which + symlink); the Windows proof is the
  // manifest-gates-windows CI job running the gates from PowerShell.
  it.skipIf(process.platform === "win32")(
    "writes the baseline sources using only git (no mkdir or tar on PATH)",
    () => {
      const gitBin = execFileSync("which", ["git"], {
        encoding: "utf8",
      }).trim();
      const onlyGit = tempDir();
      symlinkSync(gitBin, path.join(onlyGit, "git"));
      const out = tempDir();
      const head = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: ROOT,
        encoding: "utf8",
      }).trim();

      process.env.PATH = onlyGit;
      const written = materializeBaseline(head, out);
      process.env.PATH = originalPath;

      expect(written).toBeGreaterThan(50);
      for (const file of [
        "manifest.config.yaml",
        "src/app.manifest",
        "src/sales/lead.manifest",
      ]) {
        expect(readFileSync(path.join(out, file), "utf8")).toBe(
          execFileSync("git", ["show", `${head}:${file}`], {
            cwd: ROOT,
            encoding: "utf8",
          }),
        );
      }
      expect(existsSync(path.join(out, "convex"))).toBe(false);
    },
  );

  it("runs the pinned Manifest CLI through its JS entry, with no shim or shell on PATH", () => {
    expect(manifestCliEntry()).toMatch(/@angriff36[\\/]manifest[\\/].*\.js$/);
    process.env.PATH = tempDir();
    const result = runManifestCli(["--version"], { cwd: ROOT });
    process.env.PATH = originalPath;
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
