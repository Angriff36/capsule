/**
 * Alert and recovery drill (PL-MONITORING, AC-165).
 *
 *   bun run --cwd <checkout> scripts/qualify-recovery-drill.ts
 *
 * Breaks a THROWAWAY backend the way production breaks, and proves the alert
 * reaches a manager and the runbook step (docs/operations/health-and-recovery.md)
 * clears it - not only that the rules are right on paper:
 * 1. Starts a throwaway local backend in this checkout (ports 3310/3311,
 *    CONVEX_AGENT_MODE=anonymous, never the shared dev database), pushes the
 *    functions, makes an owner in one company and a manager in another, and
 *    starts a local webhook receiver that answers 404 (a switched-off
 *    receiver). The owner registers it for "Event approved".
 * 2. Break: one "Event approved" ledger row (stand-in source event). Capsule's
 *    own dispatcher sends it, gets the 404 and stops trying. Checked: the
 *    owner's bell shows "Capsule stopped trying 1 webhook", the Integrations
 *    tally says 1 stopped, the other company's manager sees nothing, and no
 *    alert carries the receiver address.
 * 3. Recover (runbook: fix the cause, then Try again): the receiver answers
 *    200, the owner uses Try again. Checked: the receiver gets the same
 *    delivery id, the bell clears, the tally says delivered.
 * 4. Break: the backend process is killed (a crash). Checked: it stops
 *    answering (the screens' "server is not answering" alert). Recover
 *    (runbook: restart the server): start it again on the same data. Checked:
 *    data from before the crash is there, the webhook schedule resumed by
 *    itself (a new event reaches the receiver), the first delivery was not
 *    sent again.
 * 5. The server-version probe of a backend set up outside a release says
 *    "unreleased" (the "set up by hand" check item).
 * Writes docs/quality/recovery-drill.json (each time and check) and exits 1
 * when a check fails.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { classifyHealth } from "../src/lib/operationalHealth";
import { convexCli } from "./backup-capsule";

const ROOT = process.cwd();
const PORT = 3310;
const URL = `http://127.0.0.1:${PORT}`;
const RECEIVER_PORT = 3399;
const RECEIVER_URL = `http://127.0.0.1:${RECEIVER_PORT}/capsule-hook`;
const ISSUER = "https://golden-koi-11.clerk.accounts.dev";
const TENANT = "tenant-recovery-drill";
const OTHER_TENANT = "tenant-recovery-other";
const OWNER = "recovery-drill-owner";
const OTHER_MANAGER = "recovery-drill-other-manager";
const OUT = join(ROOT, ".artifacts", "recovery-drill");
const STATE = join(ROOT, ".convex", "local", "default");
const envFile = join(ROOT, ".env.local");
const hadEnvFile = existsSync(envFile);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const say = (m: string) => console.log(`[recovery-drill] ${m}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
const convex = convexCli(ROOT, childEnv);
const cli = join(ROOT, "node_modules", "convex", "bin", "main.js");

async function answers() {
  try {
    return (
      await fetch(`${URL}/version`, { signal: AbortSignal.timeout(3000) })
    ).ok;
  } catch {
    return false;
  }
}

let dev: ChildProcess | undefined;
async function startBackend(name: string) {
  if (await answers())
    throw new Error(`something already answers at ${URL}; stop it first`);
  const log = join(OUT, `${name}.log`);
  const fd = openSync(log, "w");
  const launch = () =>
    spawn(
      "node",
      [
        cli,
        "dev",
        "--local-cloud-port",
        String(PORT),
        "--local-site-port",
        String(PORT + 1),
        "--codegen",
        "disable",
        "--typecheck",
        "disable",
        "--tail-logs",
        "always",
      ],
      {
        cwd: ROOT,
        env: childEnv,
        stdio: ["ignore", fd, fd],
        windowsHide: true,
      },
    );
  dev = launch();
  const started = performance.now();
  for (let i = 0, launches = 1; !(await answers()); i++) {
    if (i > 240) throw new Error(`backend never answered; see ${log}`);
    // The CLI exits when a network look-up fails (version check); start again.
    if (dev.exitCode != null && launches < 4) {
      say(`${name}: start command exited (${dev.exitCode}); starting again`);
      dev = launch();
      launches += 1;
    }
    await sleep(1000);
  }
  const answeredMs = Math.round(performance.now() - started);
  // Stand-in settings a disposable copy needs before the push can finish.
  convex(["env", "set", "CLERK_JWT_ISSUER_DOMAIN", ISSUER]);
  convex([
    "env",
    "set",
    "CONVEX_FIELD_ENCRYPTION_KEY",
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=",
  ]);
  for (let i = 0; ; i++) {
    if (/Convex functions ready/.test(readFileSync(log, "utf8"))) break;
    if (i > 0 && i % 20 === 0) {
      const now = new Date();
      utimesSync(join(ROOT, "convex", "auth.config.ts"), now, now);
    }
    if (i > 600) throw new Error(`functions never got ready; see ${log}`);
    await sleep(1000);
  }
  say(`${name}: backend up, functions pushed`);
  return { answeredMs, readyMs: Math.round(performance.now() - started) };
}

function killBackend() {
  if (dev?.pid) {
    if (process.platform === "win32")
      spawnSync("taskkill", ["/PID", String(dev.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    else dev.kill("SIGKILL");
  }
  dev = undefined;
}

async function stopBackend() {
  killBackend();
  for (let i = 0; (await answers()) && i < 30; i++) await sleep(1000);
  // The throwaway backend's settings file breaks later pushes to the shared
  // dev backend, so it goes (also when an earlier run left it).
  if (
    existsSync(envFile) &&
    (!hadEnvFile || readFileSync(envFile, "utf8").includes("anonymous-agent"))
  )
    rmSync(envFile);
}

/** A client signed in as `subject`; claims only when given (bootstrap). */
function signedIn(subject: string, claims: Record<string, string> = {}) {
  const adminKey = JSON.parse(readFileSync(join(STATE, "config.json"), "utf8"))
    .adminKey as string;
  const client = new ConvexHttpClient(URL);
  (
    client as unknown as {
      setAdminAuth(token: string, identity: Record<string, unknown>): void;
    }
  ).setAdminAuth(adminKey, { subject, issuer: ISSUER, ...claims });
  return client;
}

async function hire(subject: string, tenantId: string, role: string) {
  await signedIn(subject, { tenantId, role }).mutation(
    api.mutations.Person_createViaHire,
    {
      givenName: "Drill",
      familyName: role,
      email: `${subject}@example.com`,
      role,
      authSubjectId: subject,
      idempotencyKey: `recovery-drill-${subject}`,
    },
  );
  return signedIn(subject);
}

/** Stand-in "Event approved" ledger row the webhook dispatcher picks up. */
function sourceEvent(name: string) {
  const file = join(OUT, `${name}.jsonl`);
  writeFileSync(
    file,
    JSON.stringify({
      type: "EventApproved",
      entity: "Event",
      entityId: `recovery-drill-${name}`,
      payload: { tenantId: TENANT, title: `Drill event ${name}` },
      createdAt: Date.now(),
    }),
  );
  convex(["import", "--table", "manifestEvents", "--append", "-y", file]);
}

// Local webhook receiver: "gone" = a switched-off receiver (404).
let receiverAnswers = 404;
const received: Array<{ deliveryId: string; status: number; at: number }> = [];
const receiver = createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    received.push({
      deliveryId: String(req.headers["x-capsule-delivery-id"] ?? ""),
      status: receiverAnswers,
      at: Date.now(),
    });
    res.writeHead(receiverAnswers).end();
  });
});

async function waitFor<T>(
  label: string,
  read: () => Promise<T>,
  done: (value: T) => boolean,
  limitMs = 4 * 60_000,
): Promise<{ value: T; ms: number }> {
  const started = performance.now();
  for (;;) {
    const value = await read();
    if (done(value))
      return { value, ms: Math.round(performance.now() - started) };
    if (performance.now() - started > limitMs)
      throw new Error(`${label}: not seen within ${limitMs / 1000} s`);
    await sleep(2000);
  }
}

const checks: Array<{ check: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  checks.push({ check: name, ok, detail });
  say(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
}

type Notice = { id: string; message: string; link: string };
type Channel = { channel: string; stopped: number; delivered: number };
type DeliveryView = {
  endpointId: string;
  sourceEventId: string;
  eventType: string;
  state: string;
};

const times: Record<string, number> = {};
let releaseSha: string | undefined;
let step = "start";
try {
  await new Promise<void>((resolve) =>
    receiver.listen(RECEIVER_PORT, "127.0.0.1", resolve),
  );
  rmSync(STATE, { recursive: true, force: true });
  const first = await startBackend("first-start");
  times.firstStartReadyMs = first.readyMs;
  step = "owner sign-in";
  const owner = await hire(OWNER, TENANT, "owner");
  step = "other company's manager sign-in";
  // Owner: the bootstrap hire needs a workforce-manager role.
  const otherManager = await hire(OTHER_MANAGER, OTHER_TENANT, "owner");
  step = "first bell read";
  const bell = () =>
    owner.query(api.systemHealthNotices.attention, {}) as Promise<Notice[]>;
  const tally = async () =>
    ((await owner.query(api.deliveryHealth.outsideMessageHealth, {})) as
      Channel[] | null)!.find((c) => c.channel === "webhooks")!;

  const quiet = await bell();
  check("bell starts empty", quiet.length === 0, `${quiet.length} items`);

  step = "register the receiver";
  await owner.action(api.webhookIntegrations.registerEndpoint, {
    url: RECEIVER_URL,
    label: "Drill receiver",
    events: ["EventApproved"],
  });

  // 2. Break: the receiver is switched off.
  const brokeAt = performance.now();
  sourceEvent("one");
  const detected = await waitFor("stopped alert in the bell", bell, (items) =>
    items.some((n) => n.id === "system-health:webhooks-stopped"),
  );
  times.failureToBellMs = Math.round(performance.now() - brokeAt);
  const stoppedNotice = detected.value.find(
    (n) => n.id === "system-health:webhooks-stopped",
  )!;
  check(
    "bell names the problem and opens System health",
    stoppedNotice.message === "Capsule stopped trying 1 webhook" &&
      stoppedNotice.link === "/admin/integrations",
    `"${stoppedNotice.message}" -> ${stoppedNotice.link}`,
  );
  check(
    "Capsule tried once and stopped (404 is not retried)",
    received.length === 1 && received[0]!.status === 404,
    `${received.length} sends`,
  );
  const brokenTally = await tally();
  check(
    "System health list counts 1 stopped",
    brokenTally.stopped === 1 && brokenTally.delivered === 0,
    JSON.stringify(brokenTally),
  );
  check(
    "no alert carries the receiver address",
    !JSON.stringify(detected.value).includes(String(RECEIVER_PORT)) &&
      !JSON.stringify(
        classifyHealth({
          now: Date.now(),
          pageBuild: null,
          backend: undefined,
          messages: [
            {
              ...brokenTally,
              label: "Webhooks",
              waiting: 0,
              oldestWaitingSince: null,
              notSure: 0,
            },
          ],
          calendar: null,
          quickBooks: null,
        }),
      ).includes(String(RECEIVER_PORT)),
  );
  const otherBell = (await otherManager.query(
    api.systemHealthNotices.attention,
    {},
  )) as Notice[];
  check(
    "another company's manager sees nothing",
    otherBell.length === 0,
    `${otherBell.length} items`,
  );

  // 3. Recover: fix the cause, then Try again.
  receiverAnswers = 200;
  const deliveries = (await owner.query(
    api.webhookDeliveries.listDeliveryStates,
    {},
  )) as DeliveryView[];
  const stopped = deliveries.find((d) => d.state === "terminal_failed")!;
  const retryAt = performance.now();
  await owner.mutation(api.webhookDeliveries.retryDelivery, {
    endpointId: stopped.endpointId,
    sourceEventId: stopped.sourceEventId,
    eventType: stopped.eventType,
  });
  // The bell clears at once (waiting again is not a problem); the send itself
  // comes with the next dispatch run, at most a minute later.
  await waitFor("bell clears", bell, (items) => items.length === 0);
  times.tryAgainToBellClearMs = Math.round(performance.now() - retryAt);
  const { value: fixedTally } = await waitFor(
    "resend delivered",
    tally,
    (t) => t.delivered === 1,
  );
  times.tryAgainToDeliveredMs = Math.round(performance.now() - retryAt);
  check(
    "Try again delivers it and the bell clears",
    fixedTally.stopped === 0 &&
      fixedTally.delivered === 1 &&
      (await bell()).length === 0,
    JSON.stringify(fixedTally),
  );
  check(
    "the resend carries the same delivery id (receiver can drop repeats)",
    received.length === 2 &&
      received[1]!.status === 200 &&
      received[1]!.deliveryId === received[0]!.deliveryId,
    `${received.length} sends`,
  );

  // 4. Break: the backend process dies.
  const peopleBefore = (await owner.query(api.queries.listPerson, {})) as
    unknown[] | null;
  step = "crash and restart";
  const crashAt = performance.now();
  killBackend();
  await waitFor("backend stops answering", answers, (up) => !up, 60_000);
  const downQuery = await owner
    .query(api.deploymentProbe.health, {})
    .then(() => "answered")
    .catch(() => "failed");
  check(
    "after the crash the server does not answer (screens show 'not answering')",
    downQuery === "failed" &&
      classifyHealth({
        now: Date.now(),
        pageBuild: null,
        backend: null,
        messages: null,
        calendar: null,
        quickBooks: null,
      })[0]?.key === "server-down",
  );

  // Recover: restart the server on the same data.
  const restart = await startBackend("restart");
  times.crashToAnsweringMs = Math.round(performance.now() - crashAt);
  times.restartAnsweringMs = restart.answeredMs;
  times.restartReadyMs = restart.readyMs;
  const ownerAfter = signedIn(OWNER);
  const peopleAfter = (await ownerAfter.query(api.queries.listPerson, {})) as
    unknown[] | null;
  check(
    "data from before the crash is still there",
    (peopleAfter?.length ?? -1) === (peopleBefore?.length ?? -2) &&
      (peopleAfter?.length ?? 0) > 0,
    `${peopleAfter?.length} people`,
  );
  step = "send after the restart";
  const sendsBefore = received.length;
  const newEventAt = performance.now();
  sourceEvent("two");
  await waitFor(
    "webhook schedule resumes after restart",
    async () => received.length,
    (n) => n > sendsBefore,
  );
  times.restartNewEventDeliveredMs = Math.round(performance.now() - newEventAt);
  check(
    "the webhook schedule resumed by itself and sent only the new event",
    received.length === sendsBefore + 1 &&
      received.at(-1)!.status === 200 &&
      received.at(-1)!.deliveryId !== received[0]!.deliveryId,
    `${received.length} sends`,
  );
  const restartBell = (await ownerAfter.query(
    api.systemHealthNotices.attention,
    {},
  )) as Notice[];
  check("bell is empty after the restart", restartBell.length === 0);

  // 5. A backend set up outside a release names no release.
  const probe = (await ownerAfter.query(api.deploymentProbe.health, {})) as {
    releaseSha: string;
  };
  releaseSha = probe.releaseSha;
  check(
    "a backend set up outside a release shows the 'set up by hand' check",
    classifyHealth({
      now: Date.now(),
      pageBuild: null,
      backend: probe,
      messages: null,
      calendar: null,
      quickBooks: null,
    })[0]?.key === "server-hand-deployed",
    `releaseSha ${probe.releaseSha}`,
  );
} catch (error) {
  check(
    "drill ran to the end",
    false,
    `${step}: ${String(error).split("\n")[0]!}`,
  );
} finally {
  await stopBackend();
  rmSync(STATE, { recursive: true, force: true });
  receiver.close();
}

const report = {
  recordedAt: new Date().toISOString(),
  environment:
    "throwaway local backend (ports 3310/3311, own data folder, deleted after), local webhook receiver",
  sourceEvent:
    "a stand-in 'Event approved' ledger row; sending, failure, Try again and the alerts are Capsule's own code",
  backendReleaseSha: releaseSha ?? null,
  timesMs: times,
  checks,
};
writeFileSync(
  join(ROOT, "docs", "quality", "recovery-drill.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
if (checks.some((c) => !c.ok)) process.exitCode = 1;
