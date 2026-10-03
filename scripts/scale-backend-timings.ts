/**
 * Running-backend timing run (PL-SCALE, AC-172 backend leg).
 *
 *   bun run --cwd <checkout> scripts/scale-backend-timings.ts
 *
 * Starts a THROWAWAY local Convex backend inside this checkout
 * (CONVEX_AGENT_MODE=anonymous, state in .convex/local/default, ports
 * 3310/3311), never the shared dev database. It pushes this checkout's
 * functions, fills one company with 10,000 events, 5,000 dishes, 200 clients
 * and 20,000 menu lines (convex import), then times each read a busy screen
 * makes over HTTP: one cold call, then 120 timed calls whose arguments change
 * every call so the backend's query cache cannot answer them. Writes
 * .artifacts/product-scale-backend.json and prints it. The backend is stopped
 * at the end; a .env.local this run wrote is removed again.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const ROOT = process.cwd();
const CLOUD_PORT = 3310;
const URL = `http://127.0.0.1:${CLOUD_PORT}`;
const TENANT = "tenant-product-scale";
const DAY = 86_400_000;
const EVENTS = 10_000;
const DISHES = 5_000;
const CLIENTS = 200;
const LINES_PER_EVENT = 2;
const SAMPLES = 120;
const OUT = join(ROOT, ".artifacts", "scale-backend");
mkdirSync(OUT, { recursive: true });
const say = (m: string) => console.log(`[scale-backend] ${m}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cli = join(ROOT, "node_modules", "convex", "bin", "main.js");
const envFile = join(ROOT, ".env.local");
const hadEnvFile = existsSync(envFile);

const childEnv: Record<string, string | undefined> = {
  ...process.env,
  CONVEX_AGENT_MODE: "anonymous",
};
for (const key of [
  "CONVEX_DEPLOYMENT",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
  "CONVEX_DEPLOY_KEY",
])
  delete childEnv[key];

function convex(args: string[]) {
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

async function answers(url: string) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
}

// 1. Throwaway backend.
if (await answers(`${URL}/version`))
  throw new Error(`something already answers at ${URL}; stop it first`);
const devLog = join(OUT, "convex-dev.log");
const logFd = openSync(devLog, "w");
say(`starting a throwaway backend at ${URL}`);
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
  {
    cwd: ROOT,
    env: childEnv,
    stdio: ["ignore", logFd, logFd],
    windowsHide: true,
  },
);
function stop() {
  if (process.platform === "win32")
    spawnSync("taskkill", ["/PID", String(dev.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  else dev.kill();
  if (!hadEnvFile && existsSync(envFile)) rmSync(envFile);
}

try {
  for (let i = 0; !(await answers(`${URL}/version`)); i++) {
    if (i > 240) throw new Error(`backend never answered; see ${devLog}`);
    await sleep(1000);
  }
  // The deployment needs these before the push can finish; values are
  // stand-ins for a disposable copy (the run signs in with an admin key).
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
      // A push that failed before the settings existed retries on a file change.
      const now = new Date();
      utimesSync(join(ROOT, "convex", "auth.config.ts"), now, now);
    }
    if (i > 600) throw new Error(`functions never got ready; see ${devLog}`);
    await sleep(1000);
  }
  say("functions pushed");

  const adminKey = JSON.parse(
    readFileSync(
      join(ROOT, ".convex", "local", "default", "config.json"),
      "utf8",
    ),
  ).adminKey as string;
  const client = new ConvexHttpClient(URL);
  (
    client as unknown as {
      setAdminAuth(token: string, identity: Record<string, unknown>): void;
    }
  ).setAdminAuth(adminKey, {
    subject: "product-scale-owner",
    issuer: "https://golden-koi-11.clerk.accounts.dev",
    role: "owner",
    tenantId: TENANT,
  });

  // 2. Fill the company (skipped when an earlier run already did).
  const today = new Date(Date.UTC(2026, 9, 3)).getTime();
  const writeLines = (name: string, rows: unknown[]) => {
    const file = join(OUT, `${name}.jsonl`);
    writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n"));
    return file;
  };
  const importTable = (table: string, file: string) =>
    convex(["import", "--table", table, "--append", "-y", file]);

  let dishes = (await client.query(api.queries.listDish, {})) as Array<{
    _id: Id<"dishes">;
  }>;
  let seedMs = 0;
  if (dishes.length < DISHES) {
    const seedStart = performance.now();
    importTable(
      "clients",
      writeLines(
        "clients",
        Array.from({ length: CLIENTS }, (_, c) => ({
          tenantId: TENANT,
          clientType: "company",
          companyName: `Client ${c}`,
          givenName: "Pat",
          familyName: `Contact${c}`,
          taxExempt: false,
          paymentTermsDays: 30,
          status: "active",
          version: 1,
        })),
      ),
    );
    importTable(
      "dishes",
      writeLines(
        "dishes",
        Array.from({ length: DISHES }, (_, d) => ({
          tenantId: TENANT,
          name: `Dish ${d}`,
          portionSize: 1,
          portionUnit: "each",
          status: "active",
          version: 1,
        })),
      ),
    );
    const clients = (await client.query(api.queries.listClient, {})) as Array<{
      _id: Id<"clients">;
    }>;
    importTable(
      "events",
      writeLines(
        "events",
        Array.from({ length: EVENTS }, (_, i) => ({
          tenantId: TENANT,
          title: `Event ${i}`,
          eventType: "dinner",
          stage: i % 3 === 0 ? "approved" : "planning",
          startsAt: i % 97 === 0 ? null : today + ((i % 1095) - 730) * DAY,
          expectedHeadcount: 50 + (i % 200),
          clientId: clients[i % clients.length]!._id,
          venueName: `Venue ${i % 50}`,
          quotedPrice: 1000 + i,
          version: 1,
        })),
      ),
    );
    dishes = (await client.query(api.queries.listDish, {})) as typeof dishes;
    const eventIds = await allEventIds();
    importTable(
      "eventDishes",
      writeLines(
        "eventDishes",
        eventIds.flatMap((eventId, i) =>
          Array.from({ length: LINES_PER_EVENT }, (_, l) => ({
            tenantId: TENANT,
            eventId,
            dishId: dishes[(i * LINES_PER_EVENT + l) % dishes.length]!._id,
            quantityServings: 100,
            version: 1,
          })),
        ),
      ),
    );
    seedMs = Math.round(performance.now() - seedStart);
    say(`filled in ${seedMs} ms`);
  }

  async function allEventIds() {
    const ids: Id<"events">[] = [];
    let cursor: string | null = null;
    for (;;) {
      const page = (await client.query(api.eventLookup.reportPage, {
        paginationOpts: { numItems: 500, cursor },
      })) as {
        page: Array<{ _id: Id<"events"> }>;
        isDone: boolean;
        continueCursor: string;
      };
      ids.push(...page.page.map((r) => r._id));
      if (page.isDone) return ids;
      cursor = page.continueCursor;
    }
  }

  // 3. Time the reads.
  const eventIds = await allEventIds();
  if (eventIds.length < EVENTS || dishes.length < DISHES)
    throw new Error(
      `company has ${eventIds.length} events and ${dishes.length} dishes`,
    );
  const percentile = (sorted: number[], p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]!;
  const round = (n: number) => Math.round(n * 10) / 10;
  async function time(
    read: string,
    call: (i: number) => Promise<unknown>,
    samples = SAMPLES,
  ) {
    let start = performance.now();
    await call(0);
    const coldMs = performance.now() - start;
    const runs: number[] = [];
    for (let i = 1; i <= samples; i++) {
      start = performance.now();
      await call(i);
      runs.push(performance.now() - start);
    }
    runs.sort((a, b) => a - b);
    const t = {
      read,
      samples,
      coldMs: round(coldMs),
      p50Ms: round(percentile(runs, 0.5)),
      p95Ms: round(percentile(runs, 0.95)),
      maxMs: round(runs[runs.length - 1]!),
    };
    say(`${read}: p95 ${t.p95Ms} ms`);
    return t;
  }
  const sixWeeksFrom = today - 7 * DAY;
  const timings = [
    await time("Events page window (eventLedger.ledgerWindow, 200 rows)", (i) =>
      client.query(api.eventLedger.ledgerWindow, {
        view: "upcoming",
        dir: "asc",
        limit: 200,
        showArchived: false,
        now: today + i,
      }),
    ),
    await time("Event detail (queries.getEvent, with menu)", (i) =>
      client.query(api.queries.getEvent, { id: eventIds[(i * 79) % EVENTS]! }),
    ),
    await time("Calendar home, six weeks (eventCalendarMonth.month)", (i) =>
      client.query(api.eventCalendarMonth.month, {
        from: sixWeeksFrom + i,
        to: sixWeeksFrom + 42 * DAY + i,
      }),
    ),
    await time("Today page (todayDesk.desk)", (i) =>
      client.query(api.todayDesk.desk, { startOfToday: today + i }),
    ),
    await time("Event picker (eventLookup.picker)", (i) =>
      client.query(api.eventLookup.picker, { today: today + i }),
    ),
    await time("Dispatch week (eventLookup.range, seven days)", (i) =>
      client.query(api.eventLookup.range, {
        from: today + i,
        to: today + 7 * DAY + i,
      }),
    ),
    await time(
      "Dish list, all 5,000 (queries.listDish; same call, cache may answer)",
      () => client.query(api.queries.listDish, {}),
    ),
    await time("Dish detail (queries.getDish)", (i) =>
      client.query(api.queries.getDish, { id: dishes[(i * 37) % DISHES]!._id }),
    ),
    await time("Dishes on one menu (dishLookup.byIds, 12 dishes)", (i) =>
      client.query(api.dishLookup.byIds, {
        ids: Array.from(
          { length: 12 },
          (_, d) => dishes[(i * 41 + d * 7) % DISHES]!._id,
        ),
      }),
    ),
    await time(
      "One event's menu lines with recipes (queries.listEventDishByEventId)",
      (i) =>
        client.query(api.queries.listEventDishByEventId, {
          eventId: eventIds[(i * 53) % EVENTS]!,
        }),
    ),
  ];
  // The read the event page used before: every event's menu lines with
  // their recipe trees. One call; it may fail on the backend's read limits.
  let everyMenuLine: { ms: number; result: string };
  {
    const start = performance.now();
    try {
      const rows = (await client.query(api.queries.listEventDish, {})) as [];
      everyMenuLine = {
        ms: Math.round(performance.now() - start),
        result: `${rows.length} lines`,
      };
    } catch (error) {
      everyMenuLine = {
        ms: Math.round(performance.now() - start),
        result: `failed: ${String(error).split("\n")[0]}`,
      };
    }
    say(
      `every event's menu lines (old event page read): ${everyMenuLine.ms} ms, ${everyMenuLine.result}`,
    );
  }
  const exportWalk = await time(
    "All-time event export walk (eventLookup.reportPage, 500 a page)",
    () => allEventIds(),
    10,
  );

  const cpu = os.cpus();
  const report = {
    recordedAt: new Date().toISOString(),
    hardware: {
      cpu: cpu[0]?.model ?? "unknown",
      cores: cpu.length,
      memoryGb: Math.round(os.totalmem() / 1024 ** 3),
      os: `${os.platform()} ${os.release()}`,
      runtime: `bun ${process.versions.bun ?? "?"}`,
    },
    network: `HTTP to a local Convex backend on the same machine (${URL})`,
    data: {
      events: eventIds.length,
      dishes: dishes.length,
      clients: CLIENTS,
      menuLines: EVENTS * LINES_PER_EVENT,
    },
    seedImportMs: seedMs || "already filled",
    timings,
    exportWalk,
    everyMenuLine,
  };
  mkdirSync(join(ROOT, ".artifacts"), { recursive: true });
  writeFileSync(
    join(ROOT, ".artifacts", "product-scale-backend.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  const slow = timings.filter((t) => t.p95Ms >= 1000);
  if (slow.length) {
    say(`p95 at or over 1 s: ${slow.map((t) => t.read).join("; ")}`);
    process.exitCode = 1;
  }
} finally {
  stop();
}
