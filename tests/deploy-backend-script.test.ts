// scripts/deploy-backend.sh — the ONE production backend deploy.
//
// Offline proof. Every run uses a throwaway git checkout whose `origin` is a
// local bare repository, and a stub bin directory that shadows `bun`, `npx`,
// `curl` and `uname`. Nothing here contacts or changes production: the stubs
// only write the command line they received to calls.log.
import { describe, expect, it } from "vitest";
import { YieldingCommand } from "./yielding-command";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(__dirname, "..", "scripts", "deploy-backend.sh");
// Git Bash on Windows, never the WSL stub (same lookup as scripts/windowsGitBashPath.ts).
const GIT_BASH = [
  process.env.GIT_BASH?.trim() ?? "",
  "C:/Program Files/Git/bin/bash.exe",
  "C:/Program Files (x86)/Git/bin/bash.exe",
].find((path) => path !== "" && existsSync(path));
const BASH = process.platform === "win32" ? (GIT_BASH ?? "bash") : "bash";
const ADMIN_KEY_VALUE = "stub-admin-key-value";
const TIMEOUT = 120_000;

const STUBS: Record<string, string> = {
  bun: `#!/usr/bin/env bash
if [ "$1" = "--version" ]; then echo "\${STUB_BUN_VERSION:-9.9.9}"; exit 0; fi
echo "bun $*" >> "$STUB_LOG"
`,
  npx: `#!/usr/bin/env bash
echo "npx $*" >> "$STUB_LOG"
`,
  curl: `#!/usr/bin/env bash
echo "curl $*" >> "$STUB_LOG"
body='{"status":"success","value":[]}'
if [ -n "\${STUB_QUERY_BODY:-}" ]; then body="$STUB_QUERY_BODY"; fi
case "$*" in
  *http_code*) printf '%s' "\${STUB_HTTP_CODE:-200}" ;;
  *) printf '%s' "$body" ;;
esac
`,
  uname: `#!/usr/bin/env bash
echo "\${STUB_UNAME:-Linux}"
`,
};

interface Checkout {
  work: string;
  sha: string;
  log: string;
  run: (
    args: string[],
    env?: Record<string, string>,
  ) => Promise<{ status: number | null; output: string }>;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await YieldingCommand.run("git", args, { cwd });
  if (result.status !== 0)
    throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

async function makeCheckout(
  originName = "Angriff36/capsule.git",
): Promise<Checkout> {
  const root = mkdtempSync(join(tmpdir(), "capsule-deploy-backend-"));
  const origin = join(root, originName);
  const work = join(root, "work");
  const bin = join(root, "bin");
  const log = join(root, "calls.log");
  mkdirSync(origin, { recursive: true });
  mkdirSync(join(work, "scripts"), { recursive: true });
  mkdirSync(bin);
  for (const [name, body] of Object.entries(STUBS)) {
    writeFileSync(join(bin, name), body.replace(/\r\n/g, "\n"));
    chmodSync(join(bin, name), 0o755);
  }

  await git(origin, "init", "--bare", "-b", "main");
  await git(work, "init", "-b", "main");
  await git(work, "config", "user.email", "test@example.invalid");
  await git(work, "config", "user.name", "Deploy Script Test");
  await git(work, "config", "core.autocrlf", "false");
  writeFileSync(join(work, ".bun-version"), "9.9.9\n");
  writeFileSync(join(work, ".gitignore"), ".env.local\nconvex/scratch/\n");
  copyFileSync(SCRIPT, join(work, "scripts", "deploy-backend.sh"));
  await git(work, "add", "-A");
  await git(work, "commit", "-m", "[release] fixture");
  await git(work, "remote", "add", "origin", origin.replace(/\\/g, "/"));
  await git(work, "push", "-q", "origin", "main");

  return {
    work,
    sha: await git(work, "rev-parse", "HEAD"),
    log,
    run: async (args, env = {}) => {
      // Git Bash puts /usr/bin and /mingw64/bin ahead of the inherited PATH,
      // so the stubs go first from INSIDE bash. The .invalid addresses are the
      // second guard: a stub that lost the PATH race still reaches nothing.
      const launch =
        'export PATH="$(cygpath -u "$STUB_BIN" 2>/dev/null || echo "$STUB_BIN"):$PATH"; exec bash scripts/deploy-backend.sh "$@"';
      // The backend address is CONVEX_SELF_HOSTED_URL below: also .invalid.
      const offline = ["--frontend-url", "http://frontend.invalid/"];
      const result = await YieldingCommand.run(
        BASH,
        ["-c", launch, "bash", ...args, ...offline],
        {
          cwd: work,
          env: {
            ...process.env,
            STUB_BIN: bin,
            STUB_LOG: log.replace(/\\/g, "/"),
            CONVEX_SELF_HOSTED_URL: "http://backend.invalid",
            CONVEX_SELF_HOSTED_ADMIN_KEY: ADMIN_KEY_VALUE,
            CONVEX_DEPLOYMENT: "",
            CONVEX_DEPLOY_KEY: "",
            CONVEX_DEPLOYMENT_TOKEN: "",
            CAPSULE_DEPLOY_REEXEC: "",
            ...env,
          },
        },
      );
      return {
        status: result.status,
        output: `${result.stdout}\n${result.stderr}`,
      };
    },
  };
}

describe("scripts/deploy-backend.sh", () => {
  it(
    "dry run passes at the expected sha and runs nothing",
    async () => {
      const checkout = await makeCheckout();
      const result = await checkout.run([
        "--expect",
        checkout.sha,
        "--dry-run",
      ]);
      expect(result.output).toContain(
        `RESULT: DRY-RUN PASS - nothing was deployed (sha: ${checkout.sha})`,
      );
      expect(result.status).toBe(0);
      expect(existsSync(checkout.log)).toBe(false);
      expect(result.output).not.toContain(ADMIN_KEY_VALUE);
    },
    TIMEOUT,
  );

  it(
    "refuses a sha that is not HEAD, a missing sha and a short sha",
    async () => {
      const checkout = await makeCheckout();
      const other = "0123456789abcdef0123456789abcdef01234567";
      for (const args of [
        ["--expect", other, "--dry-run"],
        ["--dry-run"],
        ["--expect", checkout.sha.slice(0, 8), "--dry-run"],
      ]) {
        const result = await checkout.run(args);
        expect(result.output).toContain("RESULT: FAIL");
        expect(result.status).toBe(1);
      }
    },
    TIMEOUT,
  );

  it(
    "refuses tracked local changes, a foreign origin, the wrong bun and a missing credential",
    async () => {
      const dirty = await makeCheckout();
      writeFileSync(join(dirty.work, ".bun-version"), "9.9.9\n\n");
      expect(
        (await dirty.run(["--expect", dirty.sha, "--dry-run"])).output,
      ).toContain("tracked files have local changes");

      const foreign = await makeCheckout("someone-else/capsule.git");
      expect(
        (await foreign.run(["--expect", foreign.sha, "--dry-run"])).output,
      ).toContain("origin is not the Angriff36/capsule repository");

      const checkout = await makeCheckout();
      const dry = ["--expect", checkout.sha, "--dry-run"];
      expect(
        (await checkout.run(dry, { STUB_BUN_VERSION: "1.0.0" })).output,
      ).toContain(".bun-version pins 9.9.9");
      const missing = await checkout.run(dry, {
        CONVEX_SELF_HOSTED_ADMIN_KEY: "",
      });
      expect(missing.output).toContain(
        "CONVEX_SELF_HOSTED_ADMIN_KEY is not set",
      );
      expect(missing.status).toBe(1);
      expect(existsSync(checkout.log)).toBe(false);
    },
    TIMEOUT,
  );

  it(
    "a real run deploys with the documented commands, then probes the queries and the frontend",
    async () => {
      const checkout = await makeCheckout();
      const result = await checkout.run([
        "--expect",
        checkout.sha,
        "--verify",
        "listFoo,custom:listBar",
      ]);
      expect(result.output).toContain(
        `RESULT: PASS - backend deployed from ${checkout.sha}; 3 queries respond; frontend HTTP 200`,
      );
      expect(result.status).toBe(0);
      expect(result.output).not.toContain(ADMIN_KEY_VALUE);
      const calls = readFileSync(checkout.log, "utf8").trim().split("\n");
      expect(calls[0]).toBe("bun install --frozen-lockfile");
      expect(calls[1]).toBe("npx convex deploy -y");
      // The probes go to the backend the deploy used, not to a second address.
      expect(calls[2]).toContain("http://backend.invalid/api/query");
      expect(calls[2]).toContain("queries:listEvent");
      expect(calls[3]).toContain("queries:listFoo");
      expect(calls[4]).toContain("custom:listBar");
      expect(calls.at(-1)).toContain("http://frontend.invalid/");
    },
    TIMEOUT,
  );

  it(
    "probes the backend that .env.local selects when the shell has no address",
    async () => {
      const checkout = await makeCheckout();
      writeFileSync(
        join(checkout.work, ".env.local"),
        'CONVEX_SELF_HOSTED_URL="http://envfile.invalid/"\n',
      );
      const result = await checkout.run(["--expect", checkout.sha], {
        CONVEX_SELF_HOSTED_URL: "",
      });
      expect(result.output).toContain("RESULT: PASS");
      const calls = readFileSync(checkout.log, "utf8").trim().split("\n");
      expect(calls[2]).toContain("http://envfile.invalid/api/query");
      expect(result.output).not.toContain("envfile.invalid");
    },
    TIMEOUT,
  );

  it(
    "refuses a Convex Cloud deploy key in the shell, .env.local or .env",
    async () => {
      const checkout = await makeCheckout();
      const real = ["--expect", checkout.sha];
      const shell = await checkout.run(real, {
        CONVEX_DEPLOY_KEY: "prod:stub-key",
      });
      expect(shell.output).toContain("CONVEX_DEPLOY_KEY is set");
      expect(shell.output).not.toContain("prod:stub-key");
      expect(shell.status).toBe(1);

      writeFileSync(
        join(checkout.work, ".env"),
        "CONVEX_DEPLOYMENT_TOKEN=stub-token\n",
      );
      const envFile = await checkout.run(real);
      expect(envFile.output).toContain("CONVEX_DEPLOYMENT_TOKEN is set");
      expect(envFile.status).toBe(1);

      writeFileSync(join(checkout.work, ".env"), "");
      writeFileSync(
        join(checkout.work, ".env.local"),
        "CONVEX_DEPLOY_KEY=stub-key\n",
      );
      expect((await checkout.run(real)).output).toContain(
        "CONVEX_DEPLOY_KEY is set",
      );

      // Valid dotenv spellings the Convex CLI also reads.
      for (const line of [
        "CONVEX_DEPLOY_KEY = stub-key",
        "  export CONVEX_DEPLOYMENT_TOKEN=stub-token",
        "CONVEX_DEPLOY_KEY: stub-key",
      ]) {
        writeFileSync(join(checkout.work, ".env.local"), `${line}\n`);
        const result = await checkout.run(real);
        expect(result.output).toContain(
          `${/CONVEX_\w+/.exec(line)?.[0]} is set`,
        );
        expect(result.output).not.toContain("stub-key");
        expect(result.output).not.toContain("stub-token");
        expect(result.status).toBe(1);
      }
      // A comment or an empty assignment is not a key.
      writeFileSync(
        join(checkout.work, ".env.local"),
        "# CONVEX_DEPLOY_KEY=stub-key\nCONVEX_DEPLOYMENT_TOKEN=\n",
      );
      expect((await checkout.run([...real, "--dry-run"])).output).toContain(
        "RESULT: DRY-RUN PASS",
      );
      expect(existsSync(checkout.log)).toBe(false);
    },
    TIMEOUT,
  );

  it(
    "refuses untracked files under convex/ and ignores untracked files elsewhere",
    async () => {
      const checkout = await makeCheckout();
      const dry = ["--expect", checkout.sha, "--dry-run"];
      mkdirSync(join(checkout.work, "notes"));
      writeFileSync(join(checkout.work, "notes", "todo.md"), "x\n");
      expect((await checkout.run(dry)).output).toContain(
        "RESULT: DRY-RUN PASS",
      );

      mkdirSync(join(checkout.work, "convex", "lib"), { recursive: true });
      writeFileSync(join(checkout.work, "convex", "lib", "stray.ts"), "x\n");
      for (const args of [dry, ["--expect", checkout.sha]]) {
        const result = await checkout.run(args);
        expect(result.output).toContain("convex/lib/stray.ts");
        expect(result.output).toContain("would be deployed");
        expect(result.status).toBe(1);
      }
      expect(existsSync(checkout.log)).toBe(false);

      // A git-ignored file under convex/ is on disk too: the CLI bundles it.
      const ignored = await makeCheckout();
      mkdirSync(join(ignored.work, "convex", "scratch"), { recursive: true });
      writeFileSync(join(ignored.work, "convex", "scratch", "old.ts"), "x\n");
      const ignoredRun = await ignored.run(["--expect", ignored.sha]);
      expect(ignoredRun.output).toContain("convex/scratch");
      expect(ignoredRun.output).toContain("would be deployed");
      expect(ignoredRun.status).toBe(1);

      // An untracked root convex.json can point the deploy at other code.
      const config = await makeCheckout();
      writeFileSync(join(config.work, "convex.json"), '{"functions":"x/"}\n');
      const configRun = await config.run(["--expect", config.sha]);
      expect(configRun.output).toContain("convex.json");
      expect(configRun.output).toContain("would be deployed");
      expect(configRun.status).toBe(1);
      expect(existsSync(ignored.log)).toBe(false);
      expect(existsSync(config.log)).toBe(false);
    },
    TIMEOUT,
  );

  it(
    "sends the argument payload of a --verify query and never passes an argument error",
    async () => {
      const checkout = await makeCheckout();
      const real = ["--expect", checkout.sha];
      const withArgs = await checkout.run([
        ...real,
        "--verify",
        'custom:getOne={"id":"abc","deep":{"n":1}}',
        "--verify",
        "listFoo",
      ]);
      expect(withArgs.output).toContain("3 queries respond");
      const calls = readFileSync(checkout.log, "utf8").trim().split("\n");
      expect(calls[3]).toContain(
        '{"path":"custom:getOne","args":{"id":"abc","deep":{"n":1}},"format":"json"}',
      );
      expect(calls[4]).toContain('"path":"queries:listFoo","args":{}');

      const argumentError = await checkout.run(
        [...real, "--verify", "getOne"],
        {
          STUB_QUERY_BODY:
            '{"status":"error","errorMessage":"ArgumentValidationError: missing id"}',
        },
      );
      expect(argumentError.output).toContain("needs arguments");
      expect(argumentError.output).toContain("RESULT: FAIL");
      expect(argumentError.status).toBe(1);

      const fresh = await makeCheckout();
      const notJson = await fresh.run([
        "--expect",
        fresh.sha,
        "--verify",
        "getOne=abc",
      ]);
      expect(notJson.output).toContain("must be one JSON object");
      expect(notJson.status).toBe(1);
      expect(existsSync(fresh.log)).toBe(false);
    },
    TIMEOUT,
  );

  it(
    "a real run fails when a query answers Server Error, when the frontend is down, and off Linux",
    async () => {
      const checkout = await makeCheckout();
      const real = ["--expect", checkout.sha];
      const serverError = await checkout.run(real, {
        STUB_QUERY_BODY: '{"status":"error","errorMessage":"Server Error"}',
      });
      expect(serverError.output).toContain("FAIL  queries:listEvent");
      expect(serverError.output).toContain("RESULT: FAIL");
      expect(serverError.status).toBe(1);

      const down = await checkout.run(real, { STUB_HTTP_CODE: "503" });
      expect(down.output).toContain("frontend returned HTTP 503");

      const windows = await checkout.run(real, {
        STUB_UNAME: "MINGW64_NT-10.0",
      });
      expect(windows.output).toContain("Linux production box only");
      expect(windows.status).toBe(1);
    },
    TIMEOUT,
  );
});
