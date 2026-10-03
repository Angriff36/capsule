/**
 * Loop browser check — ONE command that lets the product builder see its own
 * work in a real, signed-in browser at phone width (360px) and desktop width.
 *
 *   bun run --cwd <worktree> scripts/loop-browser-check.mjs <check script> [--no-push]
 *
 * (Started by bun, it re-runs itself under node at once. It is not a
 * package.json script because package.json is Builder-owned.)
 *
 * Steps, all unattended:
 *   1. The local Convex backend (VITE_CONVEX_URL from the main checkout's
 *      .env.local) is reused; when it is down it is started from the main
 *      checkout with `convex dev`, the same way the dev stack runs it.
 *   2. This worktree's Convex functions are pushed to that local backend
 *      (skip with --no-push). Codegen is off, so the worktree stays clean.
 *   3. A Vite dev server for THIS worktree starts on a free port (7830+) and
 *      is stopped again at the end.
 *   4. The testing user signs in with a one-time Clerk sign-in ticket.
 *   5. The check script runs once at 360x740 and once at 1280x800.
 *
 * A check script is a plain .mjs (or erasable-syntax .ts) file:
 *
 *   export default async function check({ page, viewport, goto, shot, record, text }) {
 *     await goto("/events");
 *     record("events list shows", (await text()).includes("Events"), "heading");
 *     await shot("events");
 *   }
 *
 * Output: <worktree>/.artifacts/browser-check/<script>-<time>/ with one PNG per
 * shot (prefixed phone- / desktop-) and results.json. Exit 1 when any step
 * fails. Playwright runs under node (it hangs under bun on this machine); it
 * comes from a scratch install, so the repository takes no new dependency.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PLAYWRIGHT_VERSION = "1.61.1";
const TEST_USER_ID =
  process.env.LOOP_BROWSER_USER_ID ?? "user_3GR87p1FnpiFY9TUrupNU9WqWyt";
const VIEWPORTS = [
  { name: "phone", width: 360, height: 740 },
  { name: "desktop", width: 1280, height: 800 },
];

const args = process.argv.slice(2);
if (process.versions.bun) {
  // Playwright hangs under bun on this machine: hand over to node.
  const r = spawnSync("node", [process.argv[1], ...args], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
const scriptArg = args.find((a) => !a.startsWith("--"));
const push = !args.includes("--no-push");
if (!scriptArg) {
  console.error(
    "usage: bun run --cwd <worktree> scripts/loop-browser-check.mjs <check script> [--no-push]",
  );
  process.exit(2);
}
const wt = process.cwd();
const checkPath = resolve(wt, scriptArg);
if (!existsSync(checkPath)) {
  console.error(`check script not found: ${checkPath}`);
  process.exit(2);
}
const git = (...a) =>
  spawnSync("git", ["-C", wt, ...a], { encoding: "utf8" }).stdout.trim();
const main = dirname(
  git("rev-parse", "--path-format=absolute", "--git-common-dir"),
);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = join(
  wt,
  ".artifacts",
  "browser-check",
  `${basename(checkPath).replace(/\.[^.]+$/, "")}-${stamp}`,
);
mkdirSync(outDir, { recursive: true });
const say = (m) => console.log(`[browser-check] ${m}`);

function readEnv(file) {
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return env;
}
const env = readEnv(join(main, ".env.local"));
const convexUrl = env.VITE_CONVEX_URL;
for (const key of [
  "VITE_CONVEX_URL",
  "VITE_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
]) {
  if (!env[key]) throw new Error(`${key} missing from ${main}\\.env.local`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function answers(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
async function waitFor(url, seconds, what) {
  for (let i = 0; i < seconds; i++) {
    if (await answers(url)) return;
    await sleep(1000);
  }
  throw new Error(`${what} did not answer at ${url} within ${seconds}s`);
}
function logTo(name) {
  return createWriteStream(join(outDir, name));
}
async function freePort(from) {
  for (let port = from; port < from + 50; port++) {
    const ok = await new Promise((r) => {
      const s = createServer()
        .once("error", () => r(false))
        .once("listening", () => s.close(() => r(true)))
        .listen(port, "0.0.0.0");
    });
    if (ok) return port;
  }
  throw new Error(`no free port from ${from}`);
}

// 1. Local backend.
if (await answers(`${convexUrl}/version`)) {
  say(`local backend up at ${convexUrl}`);
} else {
  say(`local backend down - starting it from ${main}`);
  const logDir = join(main, ".artifacts", "loop-browser");
  mkdirSync(logDir, { recursive: true });
  const devLog = join(logDir, "convex-dev.log");
  if (process.platform === "win32") {
    // Started by Windows itself (Win32_Process.Create), not as a child of this
    // run: a child inherits every open handle of the builder round, including
    // .claude/loop-tick.log, and kept it locked so every later round failed on
    // its first log line (2026-10-02 19:02 to 21:43).
    const command = `cmd.exe /c ""${process.execPath}" "${join(main, "node_modules", "convex", "bin", "main.js")}" dev > "${devLog}" 2>&1"`;
    const created = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '${command.replace(/'/g, "''")}'; CurrentDirectory = '${main.replace(/'/g, "''")}' }; exit $r.ReturnValue`,
      ],
      { stdio: "ignore", windowsHide: true },
    );
    if (created.status !== 0)
      throw new Error(
        "could not start the local backend (Win32_Process.Create)",
      );
  } else {
    const fd = openSync(devLog, "w");
    const child = spawn(
      process.execPath,
      [join(main, "node_modules", "convex", "bin", "main.js"), "dev"],
      { cwd: main, detached: true, stdio: ["ignore", fd, fd] },
    );
    child.unref();
    closeSync(fd);
  }
  await waitFor(`${convexUrl}/version`, 180, "local Convex backend");
  // Its first push of the main checkout's functions must finish first, or it
  // would land after (and replace) this worktree's push below.
  for (let i = 0; i < 300; i++) {
    if (/Convex functions ready/.test(readFileSync(devLog, "utf8"))) break;
    if (i === 299) throw new Error(`convex dev never got ready; see ${devLog}`);
    await sleep(1000);
  }
}

// 2. This worktree's functions.
if (push) {
  say("pushing this worktree's Convex functions to the local backend");
  const adminKey = JSON.parse(
    readFileSync(
      join(main, ".convex", "local", "default", "config.json"),
      "utf8",
    ),
  ).adminKey;
  const pushEnv = {
    ...process.env,
    CONVEX_SELF_HOSTED_URL: convexUrl,
    CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey,
  };
  delete pushEnv.CONVEX_DEPLOYMENT;
  const r = spawnSync(
    process.execPath,
    [
      join(wt, "node_modules", "convex", "bin", "main.js"),
      "dev",
      "--once",
      "--codegen",
      "disable",
      "--typecheck",
      "disable",
    ],
    { cwd: wt, env: pushEnv, encoding: "utf8", windowsHide: true },
  );
  writeFileSync(join(outDir, "convex-push.log"), `${r.stdout}\n${r.stderr}`);
  if (r.status !== 0) {
    console.error(`${r.stdout}\n${r.stderr}`);
    throw new Error(
      `pushing functions failed (exit ${r.status}); see convex-push.log`,
    );
  }
}

// 3. Vite dev server for this worktree.
const port = await freePort(7830);
const base = `http://127.0.0.1:${port}`;
say(`starting Vite for this worktree at ${base}`);
const vite = spawn(
  process.execPath,
  [
    join(wt, "node_modules", "vite", "bin", "vite.js"),
    "--port",
    String(port),
    "--strictPort",
  ],
  {
    cwd: wt,
    env: {
      ...process.env,
      VITE_CONVEX_URL: convexUrl,
      VITE_CLERK_PUBLISHABLE_KEY: env.VITE_CLERK_PUBLISHABLE_KEY,
    },
    windowsHide: true,
  },
);
const viteLog = logTo("vite.log");
vite.stdout.pipe(viteLog);
vite.stderr.pipe(viteLog);
function stopVite() {
  if (vite.exitCode !== null || !vite.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(vite.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else vite.kill();
}
process.on("exit", stopVite);

const results = {
  at: new Date().toISOString(),
  script: checkPath,
  commit: git("rev-parse", "HEAD"),
  base,
  functionsPushed: push,
  viewports: [],
};
let failed = false;
try {
  await waitFor(`${base}/`, 120, "Vite dev server");

  // 4. Playwright from a scratch install (no repository dependency).
  const pwDir = join(main, ".artifacts", "loop-browser", "pw");
  if (!existsSync(join(pwDir, "node_modules", "playwright-core"))) {
    say(`installing playwright-core@${PLAYWRIGHT_VERSION} into ${pwDir}`);
    mkdirSync(pwDir, { recursive: true });
    writeFileSync(
      join(pwDir, "package.json"),
      '{"name":"loop-browser-pw","private":true}\n',
    );
    // A shell finds bun even when it is an npm .cmd shim (as on this PC).
    const r = spawnSync(`bun add playwright-core@${PLAYWRIGHT_VERSION}`, {
      cwd: pwDir,
      stdio: "inherit",
      shell: true,
    });
    if (r.status !== 0) throw new Error("installing playwright-core failed");
  }
  const pwRequire = createRequire(join(pwDir, "package.json"));
  const pwEntry = pwRequire.resolve("playwright-core");
  const { chromium } = pwRequire("playwright-core");
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (first) {
    say(`no bundled browser (${String(first).split("\n")[0]}) - installing`);
    spawnSync(
      process.execPath,
      [join(dirname(pwEntry), "cli.js"), "install", "chromium-headless-shell"],
      { stdio: "inherit" },
    );
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      browser = await chromium.launch({ channel: "chrome", headless: true });
    }
  }

  // 5. Sign in once; every page in this context shares the session.
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: TEST_USER_ID, expires_in_seconds: 600 }),
  });
  if (!res.ok) throw new Error(`Clerk sign-in ticket: HTTP ${res.status}`);
  const { token } = await res.json();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const signIn = await context.newPage();
  await signIn.goto(`${base}/?__clerk_ticket=${token}`, {
    waitUntil: "domcontentloaded",
  });
  const onSignIn = async (p) =>
    (await p.locator('input[type="password"]').count()) > 0 ||
    (await p.evaluate(() => document.body.innerText)).includes(
      "Sign in to Capsule",
    );
  // Signed in = Clerk holds a user AND the app left its sign-in screens.
  let signedIn = false;
  for (let i = 0; i < 90 && !signedIn; i++) {
    await signIn.waitForTimeout(1000);
    signedIn =
      (await signIn
        .evaluate(() => Boolean(window.Clerk?.user?.id))
        .catch(() => false)) &&
      !(await onSignIn(signIn)) &&
      !(await signIn.evaluate(() => document.body.innerText)).includes(
        "Checking your sign-in",
      );
  }
  await signIn.screenshot({ path: join(outDir, "signed-in.png") });
  await signIn.close();
  if (!signedIn) throw new Error("the sign-in ticket did not sign in");
  say("signed in as the testing user");

  const check = (await import(pathToFileURL(checkPath).href)).default;
  if (typeof check !== "function") {
    throw new Error("the check script must export a default async function");
  }
  for (const vp of VIEWPORTS) {
    const page = await context.newPage();
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const run = { ...vp, steps: [], consoleErrors: [], crashed: null };
    page.on("console", (m) => {
      if (m.type() === "error") run.consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => run.consoleErrors.push(String(e)));
    let shots = 0;
    const shot = async (name) => {
      const file = `${vp.name}-${String(++shots).padStart(2, "0")}-${name}.png`;
      await page.screenshot({ path: join(outDir, file), fullPage: true });
      return file;
    };
    const record = (name, ok, detail = "", file) => {
      run.steps.push({
        name,
        status: ok ? "PASS" : "FAIL",
        detail,
        shot: file,
      });
      if (!ok) failed = true;
      say(
        `${vp.name} ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`,
      );
      return ok;
    };
    const text = () => page.evaluate(() => document.body.innerText);
    const goto = async (path) => {
      await page.goto(new URL(path, base).href, {
        waitUntil: "domcontentloaded",
      });
      await page
        .waitForLoadState("networkidle", { timeout: 20000 })
        .catch(() => undefined);
      if (await onSignIn(page))
        throw new Error(`${path} shows the sign-in screen`);
    };
    say(`running ${basename(checkPath)} at ${vp.width}x${vp.height}`);
    try {
      await check({ page, viewport: vp, base, goto, shot, record, text });
    } catch (error) {
      failed = true;
      run.crashed = error instanceof Error ? error.stack : String(error);
      await shot("crash").catch(() => undefined);
      say(`${vp.name} CRASH ${run.crashed}`);
    }
    results.viewports.push(run);
    await page.close();
  }
  await browser.close();
} catch (error) {
  failed = true;
  results.error = error instanceof Error ? error.message : String(error);
  console.error(`[browser-check] ${results.error}`);
} finally {
  stopVite();
  writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2));
  say(
    `${failed ? "FAILED" : "passed"} - screenshots and results.json in ${outDir}`,
  );
}
process.exit(failed ? 1 : 0);
