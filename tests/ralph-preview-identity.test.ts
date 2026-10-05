// ralph-preview.ps1 — a preview is only "this checkout's preview" when the
// server proves it serves this checkout's files (AC-159, PL-GIT-MAINTENANCE).
//
// Offline proof: a stand-in server answers /src/main.tsx with a source map
// that names one checkout's folder. A plain "200 OK" is not proof. Windows
// only: the script is PowerShell.
import { afterEach, describe, expect, it } from "vitest";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(__dirname, "..", "ralph-preview.ps1");
const TIMEOUT = 60_000;
const servers: ChildProcess[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.kill();
});

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

/** A copy of the script in its own git folder: the folder it must find served. */
function checkout() {
  const root = mkdtempSync(join(tmpdir(), "capsule-ralph-preview-"));
  copyFileSync(SCRIPT, join(root, "ralph-preview.ps1"));
  git(root, "init", "-b", "dev");
  git(root, "config", "user.email", "test@example.invalid");
  git(root, "config", "user.name", "Preview Test");
  git(root, "config", "core.hooksPath", join(root, "no-hooks"));
  git(root, "add", "ralph-preview.ps1");
  git(root, "commit", "-m", "start");
  return root;
}

/** Serves /src/main.tsx with an inline source map whose file is `servedRoot`. */
async function serve(servedRoot: string): Promise<number> {
  const file = `${servedRoot.replace(/\\/g, "/")}/src/main.tsx`;
  const map = Buffer.from(JSON.stringify({ version: 3, file })).toString(
    "base64",
  );
  const body = `export {};\n//# sourceMappingURL=data:application/json;base64,${map}\n`;
  const program = `
    const http = require("node:http");
    const server = http.createServer((req, res) => {
      if (req.url === "/src/main.tsx") { res.setHeader("Content-Type", "text/javascript"); res.end(${JSON.stringify(body)}); return; }
      res.statusCode = 200; res.end("<!doctype html>");
    });
    server.listen(0, "127.0.0.1", () => console.log(server.address().port));`;
  const server = spawn(process.execPath, ["-e", program], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  servers.push(server);
  return new Promise((resolve) =>
    server.stdout!.once("data", (chunk) => resolve(Number(String(chunk)))),
  );
}

function preview(root: string, port: number, ensure = false) {
  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    join(root, "ralph-preview.ps1"),
    "-Port",
    String(port),
  ];
  if (ensure) args.push("-Ensure");
  const result = spawnSync("powershell.exe", args, { encoding: "utf8" });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

describe.skipIf(process.platform !== "win32")(
  "ralph-preview.ps1 checks which checkout a preview serves",
  () => {
    it(
      "accepts a server that serves this checkout, and names the address and folder",
      async () => {
        const root = checkout();
        const port = await serve(root);
        const run = preview(root, port);
        expect(run.status).toBe(0);
        expect(run.out).toContain(`http://127.0.0.1:${port}`);
        expect(run.out).toContain(root.replace(/\\/g, "/"));
        expect(run.out).toContain(
          `at commit ${git(root, "rev-parse", "HEAD")}`,
        );
        expect(run.out).toContain(`PID ${servers[0]!.pid} (node)`);
      },
      TIMEOUT,
    );

    it(
      "refuses a server that answers but serves another checkout",
      async () => {
        const root = checkout();
        const port = await serve(join(tmpdir(), "some-other-checkout"));
        const run = preview(root, port);
        expect(run.status).not.toBe(0);
        expect(run.out).toContain("wrong checkout");
      },
      TIMEOUT,
    );

    it(
      "will not start over another server on the same port, and leaves it running",
      async () => {
        const root = checkout();
        const port = await serve(join(tmpdir(), "some-other-checkout"));
        const run = preview(root, port, true);
        expect(run.status).not.toBe(0);
        expect(run.out).toContain(`Port ${port} is occupied`);
        expect(run.out).toContain(`PID ${servers[0]!.pid} (node)`);
        expect(servers[0]!.exitCode).toBeNull();
        expect(servers[0]!.killed).toBe(false);
      },
      TIMEOUT,
    );
  },
);
