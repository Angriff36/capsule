/**
 * Browser timing run at full size (PL-SCALE, AC-172 interaction leg).
 *
 *   bun run --cwd <checkout> scripts/scale-browser-timings.mjs
 *
 * Uses the same THROWAWAY local Convex backend as scale-backend-timings.ts
 * (state in this checkout's .convex/local/default, ports 3310/3311, never the
 * shared dev database). That script first fills a 10,000-event / 5,000-dish
 * company under the testing sign-in's own company id; this one then adds an
 * owner person row linked to the testing sign-in, starts Vite for this
 * checkout against that backend, signs the testing user in with a one-time
 * Clerk ticket, and measures how long the screen takes to answer a click or a
 * key press (the browser's own event timing: input to next paint) on the
 * Events page tabs, the Events search box and the event page's section tabs.
 * Screen opening times are recorded separately. Writes
 * .artifacts/product-scale-browser.json; exit 1 when an interaction p95 is
 * 200 ms or more. Playwright runs under node (it hangs under bun here) from the
 * scratch install scripts/loop-browser-check.mjs keeps.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import os from "node:os";
import { dirname, join } from "node:path";

if (process.versions.bun) {
  const r = spawnSync("node", [process.argv[1], ...process.argv.slice(2)], {
    stdio: "inherit",
  });
  process.exit(r.status ?? 1);
}

const { ConvexHttpClient } = await import("convex/browser");
const { anyApi, makeFunctionReference } = await import("convex/server");

const ROOT = process.cwd();
const CLOUD_PORT = 3310;
const URL_ = `http://127.0.0.1:${CLOUD_PORT}`;
const EVENTS = 10_000;
const DAY = 86_400_000;
const TEST_USER_ID =
  process.env.LOOP_BROWSER_USER_ID ?? "user_3GR87p1FnpiFY9TUrupNU9WqWyt";
const OUT = join(ROOT, ".artifacts", "scale-browser");
mkdirSync(OUT, { recursive: true });
const say = (m) => console.log(`[scale-browser] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cli = join(ROOT, "node_modules", "convex", "bin", "main.js");
const envFile = join(ROOT, ".env.local");
const hadEnvFile = existsSync(envFile);
const git = (...a) =>
  spawnSync("git", ["-C", ROOT, ...a], { encoding: "utf8" }).stdout.trim();
const main = dirname(
  git("rev-parse", "--path-format=absolute", "--git-common-dir"),
);

function readEnv(file) {
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return env;
}
const mainEnv = readEnv(join(main, ".env.local"));
for (const key of ["VITE_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"])
  if (!mainEnv[key]) throw new Error(`${key} missing from ${main}\\.env.local`);

const childEnv = { ...process.env, CONVEX_AGENT_MODE: "anonymous" };
for (const key of [
  "CONVEX_DEPLOYMENT",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
  "CONVEX_DEPLOY_KEY",
])
  delete childEnv[key];

function convex(args) {
  const r = spawnSync("node", [cli, ...args], {
    cwd: ROOT,
    env: childEnv,
    encoding: "utf8",
    windowsHide: true,
  });
  if (r.status !== 0)
    throw new Error(
      `convex ${args.join(" ")} failed:\n${r.stdout}\n${r.stderr}`,
    );
  return r.stdout;
}
async function answers(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
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
const kill = (child) => {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32")
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  else child.kill();
};

// 1. The testing sign-in carries its Clerk organization as its company, so
//    the full-size company is filled under that id (once; later runs reuse
//    it), then the same throwaway backend starts again for this run.
if (await answers(`${URL_}/version`))
  throw new Error(`something already answers at ${URL_}; stop it first`);
const memberships = await fetch(
  `https://api.clerk.com/v1/users/${TEST_USER_ID}/organization_memberships`,
  { headers: { Authorization: `Bearer ${mainEnv.CLERK_SECRET_KEY}` } },
);
if (!memberships.ok)
  throw new Error(`Clerk organization lookup: HTTP ${memberships.status}`);
const TENANT = (await memberships.json()).data?.[0]?.organization?.id;
if (!TENANT) throw new Error("the testing sign-in has no Clerk organization");
say(`filling company ${TENANT} (skipped when already full)`);
const fill = spawnSync("bun run scripts/scale-backend-timings.ts", {
  cwd: ROOT,
  env: { ...process.env, SCALE_TENANT: TENANT, SCALE_FILL_ONLY: "1" },
  stdio: "inherit",
  shell: true,
});
if (fill.status !== 0) throw new Error("filling the company failed");
const devLog = join(OUT, "convex-dev.log");
const logFd = openSync(devLog, "w");
say(`starting the throwaway backend at ${URL_}`);
const dev = spawn(
  "node",
  [
    cli,
    "dev",
    "--local-cloud-port",
    String(CLOUD_PORT),
    "--local-site-port",
    String(CLOUD_PORT + 1),
    "--codegen",
    "disable",
    "--typecheck",
    "disable",
    "--tail-logs",
    "disable",
  ],
  { cwd: ROOT, env: childEnv, stdio: ["ignore", logFd, logFd], windowsHide: true },
);
let vite;
function stop() {
  kill(vite);
  kill(dev);
  if (!hadEnvFile && existsSync(envFile)) rmSync(envFile);
}

let failed = false;
let failShot = async () => undefined;
try {
  for (let i = 0; !(await answers(`${URL_}/version`)); i++) {
    if (i > 240) throw new Error(`backend never answered; see ${devLog}`);
    await sleep(1000);
  }
  convex([
    "env",
    "set",
    "CLERK_JWT_ISSUER_DOMAIN",
    "https://golden-koi-11.clerk.accounts.dev",
  ]);
  convex([
    "env",
    "set",
    "CONVEX_FIELD_ENCRYPTION_KEY",
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=",
  ]);
  for (let i = 0; ; i++) {
    if (/Convex functions ready/.test(readFileSync(devLog, "utf8"))) break;
    if (i > 0 && i % 20 === 0) {
      const now = new Date();
      utimesSync(join(ROOT, "convex", "auth.config.ts"), now, now);
    }
    if (i > 600) throw new Error(`functions never got ready; see ${devLog}`);
    await sleep(1000);
  }
  say("functions pushed");

  const adminKey = JSON.parse(
    readFileSync(join(ROOT, ".convex", "local", "default", "config.json"), "utf8"),
  ).adminKey;
  const client = new ConvexHttpClient(URL_);
  client.setAdminAuth(adminKey, {
    subject: "product-scale-owner",
    issuer: "https://golden-koi-11.clerk.accounts.dev",
    role: "owner",
    tenantId: TENANT,
  });
  const today = new Date(Date.UTC(2026, 9, 3)).getTime();
  const ledger = await client.query(anyApi.eventLookup.reportPage, {
    paginationOpts: { numItems: 1, cursor: null },
  });
  if (!ledger?.page?.length) throw new Error("the company is still empty");

  // 2. The testing sign-in becomes this company's owner (once).
  await client.mutation(anyApi.mutations.Person_createViaHire, {
    givenName: "Scale",
    familyName: "Owner",
    email: "scale-owner@example.com",
    role: "owner",
    authSubjectId: TEST_USER_ID,
    idempotencyKey: `scale-browser-owner-${TENANT}`,
  });
  const week = await client.query(anyApi.eventLookup.range, {
    from: today,
    to: today + 7 * DAY,
  });
  const eventIds = week.rows.map((r) => r._id);
  if (eventIds.length < 10) throw new Error("fewer than 10 events this week");

  // 3. Vite for this checkout against the throwaway backend.
  const port = await freePort(7860);
  const base = `http://127.0.0.1:${port}`;
  say(`starting Vite at ${base}`);
  vite = spawn(
    process.execPath,
    [join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--port", String(port), "--strictPort"],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        VITE_CONVEX_URL: URL_,
        VITE_CLERK_PUBLISHABLE_KEY: mainEnv.VITE_CLERK_PUBLISHABLE_KEY,
      },
      windowsHide: true,
    },
  );
  const viteLog = createWriteStream(join(OUT, "vite.log"));
  vite.stdout.pipe(viteLog);
  vite.stderr.pipe(viteLog);
  for (let i = 0; !(await answers(`${base}/`)); i++) {
    if (i > 120) throw new Error("Vite never answered");
    await sleep(1000);
  }

  // 4. Browser + sign-in.
  const pwDir = join(main, ".artifacts", "loop-browser", "pw");
  if (!existsSync(join(pwDir, "node_modules", "playwright-core")))
    throw new Error(
      `no playwright-core in ${pwDir}; run scripts/loop-browser-check.mjs once`,
    );
  const { chromium } = createRequire(join(pwDir, "package.json"))(
    "playwright-core",
  );
  const browser = await chromium.launch({ headless: true });
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mainEnv.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: TEST_USER_ID, expires_in_seconds: 600 }),
  });
  if (!res.ok) throw new Error(`Clerk sign-in ticket: HTTP ${res.status}`);
  const { token } = await res.json();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  // Every click / key press the browser times (input to next paint).
  await context.addInitScript(() => {
    window.__interactions = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        if (e.interactionId)
          window.__interactions.push({ id: e.interactionId, ms: e.duration });
    }).observe({ type: "event", durationThreshold: 16, buffered: true });
  });
  const page = await context.newPage();
  failShot = () => page.screenshot({ path: join(OUT, "failed.png") });
  const consoleLog = createWriteStream(join(OUT, "console.log"));
  page.on("console", (m) => consoleLog.write(`${m.type()}: ${m.text()}\n`));
  await page.goto(`${base}/?__clerk_ticket=${token}`, {
    waitUntil: "domcontentloaded",
  });
  let signedIn = false;
  for (let i = 0; i < 90 && !signedIn; i++) {
    await page.waitForTimeout(1000);
    const body = await page.evaluate(() => document.body.innerText).catch(() => "");
    signedIn =
      (await page.evaluate(() => Boolean(window.Clerk?.user?.id)).catch(() => false)) &&
      !body.includes("Sign in to Capsule") &&
      !body.includes("Checking your sign-in") &&
      !body.includes("Checking your session");
  }
  await page.screenshot({ path: join(OUT, "signed-in.png") });
  if (!signedIn) throw new Error("the sign-in ticket did not sign in");
  if ((await page.evaluate(() => document.body.innerText)).includes("open your profile")) {
    const net = await page.evaluate(async () => {
      const r = await fetch(
        "https://golden-koi-11.clerk.accounts.dev/v1/environment",
      ).then(
        (x) => `HTTP ${x.status}`,
        (e) => String(e),
      );
      return `online ${navigator.onLine}; clerk fetch ${r}`;
    });
    say(net);
    const jwt = await page.evaluate(() => window.Clerk.session.getToken());
    const probe = new ConvexHttpClient(URL_);
    probe.setAuth(jwt);
    const claims = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
    const outcome = await probe
      .action(anyApi.authLink.ensureAccountProfile, {})
      .catch((e) => String(e));
    throw new Error(
      `profile did not open: ${JSON.stringify(outcome)}; token claims ${JSON.stringify(claims)}`,
    );
  }
  say("signed in");

  const percentile = (sorted, p) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
  const summary = (name, list) => {
    const s = [...list].sort((a, b) => a - b);
    return {
      name,
      samples: s.length,
      p50Ms: Math.round(percentile(s, 0.5)),
      p95Ms: Math.round(percentile(s, 0.95)),
      maxMs: Math.round(s[s.length - 1]),
    };
  };
  // One interaction: run it, give the screen time to paint, read the longest
  // timed event of the new interaction. No entry = under the 16 ms floor.
  async function interaction(act) {
    const before = await page.evaluate(() => window.__interactions.length);
    await act();
    await page.waitForTimeout(400);
    const entries = await page.evaluate(
      (n) => window.__interactions.slice(n),
      before,
    );
    return entries.length ? Math.max(...entries.map((e) => e.ms)) : 16;
  }
  // Every server read the screen asks for over the Convex socket, with the
  // time from asking to the first answer (slowest first).
  let reads = null;
  page.on("websocket", (ws) => {
    const asked = new Map();
    ws.on("framesent", ({ payload }) => {
      if (!reads) return;
      const msg = JSON.parse(String(payload));
      if (msg.type !== "ModifyQuerySet") return;
      for (const m of msg.modifications)
        if (m.type === "Add")
          asked.set(m.queryId, {
            udfPath: m.udfPath,
            args: m.args?.[0] ?? {},
            at: Date.now(),
          });
    });
    ws.on("framereceived", ({ payload }) => {
      if (!reads) return;
      const msg = JSON.parse(String(payload));
      if (msg.type !== "Transition") return;
      for (const m of msg.modifications) {
        const q = asked.get(m.queryId);
        if (!q || q.done) continue;
        q.done = true;
        reads.push({
          read: q.udfPath,
          args: q.args,
          ms: Date.now() - q.at,
          ...(m.type === "QueryFailed" ? { failed: m.errorMessage } : {}),
        });
      }
    });
  });
  async function open(path, ready, probe) {
    if (probe) reads = [];
    const start = Date.now();
    await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(ready, null, { timeout: 60_000 });
    const ms = Date.now() - start;
    if (probe) {
      // The socket answers a screen's reads together, so time each one
      // alone over HTTP (as the company's owner) to find the slow ones.
      const alone = [];
      for (const r of reads) {
        const t0 = Date.now();
        const outcome = await client
          .query(makeFunctionReference(r.read), r.args)
          .then(
            () => "ok",
            (e) => String(e).split("\n")[0],
          );
        alone.push({ read: r.read, ms: Date.now() - t0, outcome });
      }
      results.slowestReads[path] = alone
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 12);
      reads = null;
    }
    return ms;
  }

  const results = { opens: [], interactions: [], slowestReads: {} };

  // Events page.
  const listOpens = [];
  for (let i = 0; i < 5; i++)
    listOpens.push(
      await open(
        "/events",
        () =>
          document.querySelectorAll('[role="tab"][aria-selected]').length >= 3 &&
          /Event \d/.test(document.body.innerText),
        i === 4,
      ),
    );
  results.opens.push(summary("Events page opens to its list", listOpens));
  await page.screenshot({ path: join(OUT, "events.png") });
  const tabs = page.locator('[role="tablist"][aria-label="Show"] [role="tab"]');
  const tabCount = await tabs.count();
  const tabTimes = [];
  for (let i = 0; i < 45; i++)
    tabTimes.push(await interaction(() => tabs.nth(i % tabCount).click()));
  results.interactions.push(summary("Events page tab click", tabTimes));
  const search = page.getByPlaceholder("Search title, client, venue…");
  const keyTimes = [];
  for (let round = 0; round < 5; round++) {
    await search.click();
    for (const ch of `Event ${round + 1}`)
      keyTimes.push(await interaction(() => page.keyboard.press(ch === " " ? "Space" : ch)));
    keyTimes.push(await interaction(() => search.fill("")));
  }
  results.interactions.push(summary("Events search key press", keyTimes));
  await page.screenshot({ path: join(OUT, "events-search.png") });

  // Event page section tabs, on ten events.
  const eventOpens = [];
  const sectionTimes = [];
  for (const [e, id] of eventIds.slice(0, 10).entries()) {
    eventOpens.push(
      await open(
        `/events/${id}`,
        () =>
          document.querySelectorAll('nav[aria-label="Event sections"] [role="tab"]')
            .length > 0,
        e === 9,
      ),
    );
    const sections = page.locator('nav[aria-label="Event sections"] [role="tab"]');
    const n = await sections.count();
    for (let k = 1; k <= n; k++)
      sectionTimes.push(await interaction(() => sections.nth(k % n).click()));
  }
  results.opens.push(summary("Event page opens to its sections", eventOpens));
  results.interactions.push(summary("Event page section tab click", sectionTimes));
  await page.screenshot({ path: join(OUT, "event.png"), fullPage: true });
  const browserVersion = browser.version();
  await browser.close();

  const all = results.interactions.flatMap((r) => r.samples);
  const cpu = os.cpus();
  const report = {
    recordedAt: new Date().toISOString(),
    hardware: {
      cpu: cpu[0]?.model ?? "unknown",
      cores: cpu.length,
      memoryGb: Math.round(os.totalmem() / 1024 ** 3),
      os: `${os.platform()} ${os.release()}`,
      browser: `headless Chromium ${browserVersion}`,
      viewport: "1280x800",
      app: "Vite dev server (development React build)",
    },
    network: `local Convex backend on the same machine (${URL_})`,
    data: { events: EVENTS, dishes: 5_000 },
    measure:
      "browser event timing: input to next paint, longest event of each interaction; 16 = under the browser's 16 ms floor",
    totalInteractionSamples: all.reduce((a, b) => a + b, 0),
    ...results,
  };
  writeFileSync(
    join(ROOT, ".artifacts", "product-scale-browser.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  const slow = results.interactions.filter((r) => r.p95Ms >= 200);
  if (slow.length) {
    failed = true;
    say(`p95 at or over 200 ms: ${slow.map((r) => r.name).join("; ")}`);
  }
} catch (error) {
  failed = true;
  await failShot().catch(() => undefined);
  console.error(`[scale-browser] ${error instanceof Error ? error.stack : error}`);
} finally {
  stop();
}
process.exit(failed ? 1 : 0);
