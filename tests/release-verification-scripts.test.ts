// scripts/verify-vercel-release.ts and scripts/release-backend-scope.ts — the
// two read-only checks that scripts/deploy-production.sh runs after a release.
//
// Offline: the verifier reads version.json from a server on 127.0.0.1, and the
// scope script runs in a throwaway git repository. Nothing contacts Vercel,
// GitHub, or production.
import { describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const SHA = "0123456789abcdef0123456789abcdef01234567";
const OTHER = "fedcba9876543210fedcba9876543210fedcba98";
const TIMEOUT = 120_000;

function runBun(
  args: string[],
  cwd: string,
): Promise<{ status: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("bun", args, {
      cwd,
      shell: process.platform === "win32",
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.stderr.on("data", (chunk) => (output += String(chunk)));
    child.on("close", (status) => resolve({ status, output }));
  });
}

/** Serve one body for /version.json on 127.0.0.1; returns the site URL. */
async function serve(body: string, contentType: string) {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": contentType });
    response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { site: `http://127.0.0.1:${port}`, close: () => server.close() };
}

describe("scripts/verify-vercel-release.ts", () => {
  it(
    "passes only when the site serves the build of exactly that commit",
    async () => {
      const verify = (site: string, sha: string) =>
        runBun(
          [
            "scripts/verify-vercel-release.ts",
            "--sha",
            sha,
            "--wait",
            "0",
            "--url",
            site,
          ],
          ROOT,
        );

      const live = await serve(`{"commit":"${SHA}"}\n`, "application/json");
      const match = await verify(live.site, SHA);
      expect(match.output).toContain(`serves the build of ${SHA}`);
      expect(match.status).toBe(0);
      // A stale READY deployment (another commit) is never accepted.
      const stale = await verify(live.site, OTHER);
      expect(stale.output).toContain("FAIL");
      expect(stale.output).toContain(`commit ${SHA}`);
      expect(stale.status).toBe(1);
      live.close();

      // A build from before version.json: the SPA answers index.html.
      const old = await serve("<!doctype html><html></html>", "text/html");
      const html = await verify(old.site, SHA);
      expect(html.output).toContain("FAIL");
      expect(html.status).toBe(1);
      old.close();

      const empty = await serve('{"commit":null}\n', "application/json");
      expect((await verify(empty.site, SHA)).status).toBe(1);
      empty.close();
    },
    TIMEOUT,
  );
});

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

/** A repository whose main holds one [release] commit, with the scope script in it. */
function makeRepo(): string {
  const work = mkdtempSync(join(tmpdir(), "capsule-release-scope-"));
  git(work, "init", "-b", "main");
  git(work, "config", "user.email", "test@example.invalid");
  git(work, "config", "user.name", "Release Scope Test");
  git(work, "config", "core.autocrlf", "false");
  mkdirSync(join(work, "scripts"));
  mkdirSync(join(work, "src", "lib"), { recursive: true });
  mkdirSync(join(work, "convex"));
  copyFileSync(
    join(ROOT, "scripts", "release-backend-scope.ts"),
    join(work, "scripts", "release-backend-scope.ts"),
  );
  copyFileSync(
    join(ROOT, "src", "lib", "releaseBackendScope.ts"),
    join(work, "src", "lib", "releaseBackendScope.ts"),
  );
  writeFileSync(
    join(work, "convex", "queries.ts"),
    "export const listEvent = query({\n  args: {},\n});\n",
  );
  git(work, "add", "-A");
  git(work, "commit", "-m", "[release] feat/first (reviewed by test-model)");
  return work;
}

const scopeOf = (work: string) =>
  runBun(
    [
      "scripts/release-backend-scope.ts",
      "--sha",
      git(work, "rev-parse", "HEAD"),
    ],
    work,
  );

describe("scripts/release-backend-scope.ts", () => {
  it(
    "counts everything since the previous [release] commit, also for an empty [release] commit",
    async () => {
      // A GitHub-side merge lands backend code; release.sh then adds an EMPTY
      // [release] commit. The backend change is in the range, not in that commit.
      const work = makeRepo();
      writeFileSync(
        join(work, "convex", "queries.ts"),
        "export const listEvent = query({\n  args: {},\n});\nexport const listKit = query({\n  args: {},\n});\n",
      );
      git(work, "add", "-A");
      git(work, "commit", "-m", "Merge pull request #1 (landed on GitHub)");
      git(
        work,
        "commit",
        "--allow-empty",
        "-m",
        "[release] feat/second (reviewed by test-model)",
      );
      const backend = await scopeOf(work);
      expect(backend.output).toContain("backend=required");
      expect(backend.output).toContain("reason=convex/queries.ts");
      expect(backend.output).toContain("verify=listKit");
      expect(backend.status).toBe(0);

      // Frontend-only since the previous release.
      writeFileSync(join(work, "src", "page.tsx"), "export {};\n");
      git(work, "add", "-A");
      git(
        work,
        "commit",
        "-m",
        "[release] feat/third (reviewed by test-model)",
      );
      const frontend = await scopeOf(work);
      expect(frontend.output).toContain("backend=unchanged");
      expect(frontend.status).toBe(0);

      // Tracked edits under src/ or convex/ make the import closure unreliable.
      writeFileSync(join(work, "src", "page.tsx"), "export const x = 1;\n");
      const dirty = await scopeOf(work);
      expect(dirty.output).toContain("have local changes");
      expect(dirty.status).toBe(2);
    },
    TIMEOUT,
  );

  it(
    "with no previous [release] commit the backend deploy is required",
    async () => {
      const work = makeRepo();
      const first = await scopeOf(work);
      expect(first.output).toContain("backend=required");
      expect(first.status).toBe(0);
    },
    TIMEOUT,
  );
});
