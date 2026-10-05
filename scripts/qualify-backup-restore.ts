/**
 * Backup restore drill (PL-BACKUPS, AC-164).
 *
 *   bun run --cwd <checkout> scripts/qualify-backup-restore.ts
 *
 * Proves a backup made by scripts/backup-capsule.ts brings a company back,
 * not only that the backup command finished:
 * 1. Starts a THROWAWAY local backend in this checkout (ports 3310/3311,
 *    CONVEX_AGENT_MODE=anonymous, never the shared dev database), pushes the
 *    functions and fills one company: an owner linked to a sign-in, clients,
 *    dishes (three with a stored picture), events tied to clients and menu
 *    lines tied to events and dishes.
 * 2. Takes three encrypted backups with --keep 2 (the oldest must go), then
 *    writes one more client: the restore must not have it (what a backup
 *    loses is everything after it was taken).
 * 3. Stops that backend, deletes its data and starts an EMPTY one (the
 *    isolated environment), pushes the functions and checks it holds nothing
 *    and the owner's sign-in reaches no company.
 * 4. A restore with the wrong key must fail and leave it empty. Then the
 *    newest backup is restored and checked: same record ids and counts, every
 *    event still names its client, every menu line its event and dish, each
 *    picture opens through the app with the same bytes, the owner's sign-in
 *    reaches the company again (people row restored, no claims), and a
 *    stranger's sign-in still reaches nothing.
 * Writes docs/quality/backup-restore-drill.json (backup and restore times,
 * size, counts, each check) and exits 1 when a check fails.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  BACKUP_SUFFIX,
  backup,
  convexCli,
  restore,
  type BackupReceipt,
} from "./backup-capsule";

const ROOT = process.cwd();
const PORT = 3310;
const URL = `http://127.0.0.1:${PORT}`;
const ISSUER = "https://golden-koi-11.clerk.accounts.dev";
const TENANT = "tenant-backup-drill";
const OWNER = "backup-drill-owner";
const CLIENTS = 20;
const DISHES = 30;
const EVENTS = 100;
const LINES_PER_EVENT = 2;
const OUT = join(ROOT, ".artifacts", "backup-drill");
const BACKUPS = join(OUT, "backups");
const STATE = join(ROOT, ".convex", "local", "default");
const envFile = join(ROOT, ".env.local");
const hadEnvFile = existsSync(envFile);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(BACKUPS, { recursive: true });

const say = (m: string) => console.log(`[backup-drill] ${m}`);
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
  dev = spawn(
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
      "disable",
    ],
    { cwd: ROOT, env: childEnv, stdio: ["ignore", fd, fd], windowsHide: true },
  );
  for (let i = 0; !(await answers()); i++) {
    if (i > 240) throw new Error(`backend never answered; see ${log}`);
    await sleep(1000);
  }
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
}

async function stopBackend() {
  if (dev?.pid) {
    if (process.platform === "win32")
      spawnSync("taskkill", ["/PID", String(dev.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    else dev.kill();
  }
  dev = undefined;
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

const sha = (bytes: ArrayBuffer | Buffer) =>
  createHash("sha256")
    .update(Buffer.from(bytes as ArrayBuffer))
    .digest("hex");

type Row = { _id: string } & Record<string, unknown>;
async function picture(owner: ConvexHttpClient, i: number) {
  const bytes = randomBytes(2048 + i * 512);
  const uploadUrl = (await owner.mutation(
    api.fileStorage.generateUploadUrl,
    {},
  )) as string;
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: bytes,
  });
  const { storageId } = (await res.json()) as { storageId: string };
  return { storageId, sha256: sha(bytes) };
}

/** What a manager of the company sees, by id. */
async function companyView(client: ConvexHttpClient, storageIds: string[]) {
  const ids = (rows: Row[]) => rows.map((r) => r._id).sort();
  const clients = (await client.query(api.queries.listClient, {})) as Row[];
  const dishes = (await client.query(api.queries.listDish, {})) as Row[];
  const events = (await client.query(api.queries.listEvent, {})) as Row[];
  const lines = (await client.query(api.queries.listEventDish, {})) as Row[];
  const urls = (await client.query(api.fileStorage.urlsForStorageIds, {
    storageIds,
  })) as Record<string, string | null>;
  const pictures: Record<string, string | null> = {};
  for (const id of storageIds) {
    const url = urls[id];
    pictures[id] = url ? sha(await (await fetch(url)).arrayBuffer()) : null;
  }
  return {
    clients: ids(clients),
    dishes: ids(dishes),
    events: ids(events),
    lines: ids(lines),
    eventClient: Object.fromEntries(
      events.map((e) => [e._id, String(e.clientId)]),
    ),
    lineLinks: Object.fromEntries(
      lines.map((l) => [l._id, `${String(l.eventId)}/${String(l.dishId)}`]),
    ),
    dishPictures: Object.fromEntries(
      dishes
        .filter((d) => d.primaryImageStorageId)
        .map((d) => [d._id, String(d.primaryImageStorageId)]),
    ),
    pictures,
  };
}

const checks: Array<{ check: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  checks.push({ check: name, ok, detail });
  say(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

const key = randomBytes(32);
const receipts: BackupReceipt[] = [];
let restoreMs = 0;
let emptyToRestoredMs = 0;
let before: Awaited<ReturnType<typeof companyView>> | undefined;
let after: typeof before;
try {
  // 1. Source backend with one filled company.
  rmSync(STATE, { recursive: true, force: true });
  await startBackend("source");
  const bootstrap = signedIn(OWNER, { tenantId: TENANT, role: "owner" });
  await bootstrap.mutation(api.mutations.Person_createViaHire, {
    givenName: "Drill",
    familyName: "Owner",
    email: "backup-drill-owner@example.com",
    role: "owner",
    authSubjectId: OWNER,
    idempotencyKey: `backup-drill-owner-${TENANT}`,
  });
  const owner = signedIn(OWNER);
  const pictures = [
    await picture(owner, 0),
    await picture(owner, 1),
    await picture(owner, 2),
  ];
  const storageIds = pictures.map((p) => p.storageId);
  const importRows = (table: string, rows: unknown[]) => {
    const file = join(OUT, `${table}.jsonl`);
    writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n"));
    convex(["import", "--table", table, "--append", "-y", file]);
  };
  importRows(
    "clients",
    Array.from({ length: CLIENTS }, (_, c) => ({
      tenantId: TENANT,
      clientType: "company",
      companyName: `Drill client ${c}`,
      givenName: "Pat",
      familyName: `Contact${c}`,
      taxExempt: false,
      paymentTermsDays: 30,
      status: "active",
      version: 1,
    })),
  );
  importRows(
    "dishes",
    Array.from({ length: DISHES }, (_, d) => ({
      tenantId: TENANT,
      name: `Drill dish ${d}`,
      portionSize: 1,
      portionUnit: "each",
      status: "active",
      version: 1,
      ...(d < pictures.length
        ? { primaryImageStorageId: pictures[d]!.storageId }
        : {}),
    })),
  );
  const clients = (await owner.query(api.queries.listClient, {})) as Row[];
  const dishes = (await owner.query(api.queries.listDish, {})) as Row[];
  const today = Date.UTC(2026, 9, 4);
  importRows(
    "events",
    Array.from({ length: EVENTS }, (_, i) => ({
      tenantId: TENANT,
      title: `Drill event ${i}`,
      eventType: "dinner",
      stage: i % 3 === 0 ? "approved" : "planning",
      startsAt: today + (i - 50) * 86_400_000,
      expectedHeadcount: 50 + i,
      clientId: clients[i % clients.length]!._id,
      venueName: `Venue ${i % 10}`,
      quotedPrice: 1000 + i,
      version: 1,
    })),
  );
  const events = (await owner.query(api.queries.listEvent, {})) as Row[];
  importRows(
    "eventDishes",
    events.flatMap((event, i) =>
      Array.from({ length: LINES_PER_EVENT }, (_, l) => ({
        tenantId: TENANT,
        eventId: event._id,
        dishId: dishes[(i * LINES_PER_EVENT + l) % dishes.length]!._id,
        quantityServings: 100,
        version: 1,
      })),
    ),
  );
  before = await companyView(owner, storageIds);
  check(
    "source company filled",
    before.clients.length === CLIENTS &&
      before.dishes.length === DISHES &&
      before.events.length === EVENTS &&
      before.lines.length === EVENTS * LINES_PER_EVENT &&
      pictures.every((p) => before!.pictures[p.storageId] === p.sha256),
    `${before.clients.length} clients, ${before.dishes.length} dishes, ${before.events.length} events, ${before.lines.length} menu lines, ${pictures.length} pictures`,
  );

  // 2. Three backups, keep two; then a write the backups do not have.
  for (let n = 0; n < 3; n++)
    receipts.push(
      await backup({
        convex,
        dir: BACKUPS,
        keep: 2,
        key,
        now: new Date(Date.now() + n * 1000),
      }),
    );
  const left = readdirSync(BACKUPS).filter((f) => f.endsWith(BACKUP_SUFFIX));
  check(
    "only the newest two backups are kept",
    left.length === 2 && receipts[2]!.removedOld.length === 1,
    left.join(", "),
  );
  const newest = receipts[2]!;
  const plain = readFileSync(newest.file);
  check(
    "backup file is encrypted (no readable table names inside)",
    !plain.includes("documents.jsonl") && !plain.includes("Drill client"),
  );
  check(
    "receipt lists setting names, never their values",
    newest.settingNames.includes("CONVEX_FIELD_ENCRYPTION_KEY") &&
      !readFileSync(
        newest.file.replace(BACKUP_SUFFIX, ".json"),
        "utf8",
      ).includes("A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU="),
    newest.settingNames.join(", "),
  );
  await owner.mutation(api.mutations.Client_createViaRegister, {
    clientType: "company",
    companyName: "Written after the backup",
  });
  const lateClients = (await owner.query(api.queries.listClient, {})) as Row[];
  check(
    "a client written after the backup exists on the source",
    lateClients.length === CLIENTS + 1,
  );

  // 3. Isolated, empty backend.
  await stopBackend();
  rmSync(STATE, { recursive: true, force: true });
  const emptyStart = performance.now();
  await startBackend("restore-target");
  const emptyOwner = signedIn(OWNER);
  const emptyEvents = (await emptyOwner
    .query(api.queries.listEvent, {})
    .catch(() => [])) as Row[];
  const emptyClients = (await signedIn(OWNER, {
    tenantId: TENANT,
    role: "owner",
  }).query(api.queries.listClient, {})) as Row[];
  check(
    "restore target starts empty",
    emptyEvents.length === 0 && emptyClients.length === 0,
  );

  // 4. Wrong key, then the real restore.
  let wrongKeyFailed = false;
  try {
    await restore({ convex, file: newest.file, key: randomBytes(32) });
  } catch {
    wrongKeyFailed = true;
  }
  const afterWrongKey = (await signedIn(OWNER, {
    tenantId: TENANT,
    role: "owner",
  }).query(api.queries.listClient, {})) as Row[];
  check(
    "a wrong key fails and imports nothing",
    wrongKeyFailed && afterWrongKey.length === 0,
  );
  ({ restoreMs } = await restore({ convex, file: newest.file, key }));
  emptyToRestoredMs = Math.round(performance.now() - emptyStart);
  after = await companyView(signedIn(OWNER), storageIds);
  check(
    "same record ids and counts",
    same(before.clients, after.clients) &&
      same(before.dishes, after.dishes) &&
      same(before.events, after.events) &&
      same(before.lines, after.lines),
    `${after.clients.length} clients, ${after.dishes.length} dishes, ${after.events.length} events, ${after.lines.length} menu lines`,
  );
  check(
    "every event still names its client, every menu line its event and dish",
    same(before.eventClient, after.eventClient) &&
      same(before.lineLinks, after.lineLinks) &&
      Object.values(after.eventClient).every((c) =>
        after!.clients.includes(c),
      ) &&
      Object.values(after.lineLinks).every((link) => {
        const [eventId, dishId] = link.split("/");
        return (
          after!.events.includes(eventId!) && after!.dishes.includes(dishId!)
        );
      }),
  );
  check(
    "each picture opens through the app with the same bytes",
    same(before.dishPictures, after.dishPictures) &&
      pictures.every((p) => after!.pictures[p.storageId] === p.sha256),
  );
  check(
    "the owner's sign-in reaches the company again (no claims, people row only)",
    after.events.length === EVENTS,
  );
  const stranger = (await signedIn("backup-drill-stranger")
    .query(api.queries.listEvent, {})
    .catch(() => [])) as Row[];
  check("a stranger's sign-in still reaches nothing", stranger.length === 0);
  check(
    "the client written after the backup is not restored",
    after.clients.length === CLIENTS,
  );
} catch (error) {
  check("drill ran to the end", false, String(error).split("\n")[0]!);
} finally {
  await stopBackend();
  rmSync(STATE, { recursive: true, force: true });
}

const newest = receipts.at(-1);
const report = {
  recordedAt: new Date().toISOString(),
  data: before && {
    clients: before.clients.length,
    dishes: before.dishes.length,
    events: before.events.length,
    menuLines: before.lines.length,
    pictures: Object.keys(before.pictures).length,
  },
  backup: newest && {
    exportAndEncryptMs: newest.exportMs,
    bytes: newest.bytes,
    settingNames: newest.settingNames.length,
  },
  restore: {
    decryptAndImportMs: restoreMs,
    emptyBackendToRestoredMs: emptyToRestoredMs,
  },
  lossWindow:
    "Everything written after the newest backup. With the daily schedule in the runbook that is up to 24 hours; the drill proves a write made after the backup is not in the restore.",
  checks,
};
writeFileSync(
  join(ROOT, "docs", "quality", "backup-restore-drill.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
if (checks.some((c) => !c.ok)) process.exitCode = 1;
