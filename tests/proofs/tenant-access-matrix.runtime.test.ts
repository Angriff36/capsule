/**
 * Runtime proof (PL-AUTH, AC-151 / PR12-10 negative matrix; AC-212; AC-403):
 * two workspaces, A and B, each with one record in EVERY workspace-owned
 * table. Record links point at the same workspace's own records, and every
 * number in workspace A is 7331 (workspace B uses 1), so a leaked total or
 * count changes the answer.
 *
 * Every public read and write in convex/ runs as each role of workspace B
 * (linked staff profiles), a workspace B sign-in with no staff profile, a
 * signed-out caller, and a removed person of workspace A. Arguments point at
 * workspace A: its id, its record ids, its parent ids. Each optional argument
 * that names a record or a workspace is also sent on its own.
 *
 * - Reads: the same caller runs the same call in a copy with NO workspace A
 *   records. The two answers (value or error text) must be identical, so no
 *   name, number, flag, record or "exists / does not exist" difference from
 *   workspace A reaches the caller. Workspace A's ids simply do not exist in
 *   the copy, so this is also the real-versus-missing id check for every read.
 * - Writes: no workspace A record changes, disappears or appears.
 *
 * Per-function ledger (tenant-access-matrix.ledger.json): for each read,
 * whether workspace A's owner gets a different answer because of workspace
 * A's records; for each write, whether the owner's call changes a workspace A
 * record; otherwise the owner's own result, as the reason the probe cannot
 * reach further. A read or write the ledger records as reaching must keep
 * reaching. Refresh with UPDATE_MATRIX_LEDGER=1 (or empty / delete the file).
 * Synthetic data only.
 */
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
  // Same clock in both copies, so answers compare exactly.
  vi.useFakeTimers({ toFake: ["Date"], now: Date.UTC(2026, 8, 27, 12) });
});
afterAll(() => {
  vi.useRealTimers();
});

const TENANT_A = "matrix-tenant-a";
const TENANT_B = "matrix-tenant-b";
const MARK = "matrix-probe";
const NUMBER: Record<string, number> = { [TENANT_A]: 7331, [TENANT_B]: 1 };
const LEDGER_PATH = fileURLToPath(
  new URL("./tenant-access-matrix.ledger.json", import.meta.url),
);

/** Every role the generated role table knows (convex/queries.ts ROLE_PERMISSIONS). */
const ROLES = [
  "owner",
  "admin",
  "manager",
  "system",
  "staff",
  "driver",
  "event_manager",
  "event_staff",
  "finance_manager",
  "finance_staff",
  "inventory_manager",
  "inventory_staff",
  "kitchen_lead",
  "kitchen_manager",
  "kitchen_staff",
  "logistics_manager",
  "logistics_staff",
  "procurement_staff",
  "sales_manager",
  "sales_staff",
  "workforce_manager",
  "workforce_staff",
] as const;

type Json =
  | { type: "string" | "number" | "bigint" | "boolean" | "null" | "any" }
  | { type: "bytes" }
  | { type: "id"; tableName: string }
  | { type: "literal"; value: unknown }
  | { type: "array"; value: Json }
  | { type: "record"; keys: Json; values: { fieldType: Json } }
  | { type: "union"; value: Json[] }
  | {
      type: "object";
      value: Record<string, { fieldType: Json; optional: boolean }>;
    };

type Doc = Record<string, unknown>;
type Harness = ReturnType<typeof convexTest>;
type Fn = {
  isQuery?: boolean;
  isMutation?: boolean;
  isPublic?: boolean;
  exportArgs?: () => string;
};
/** One workspace: its id and its seeded record per table. */
type Side = { tenant: string; seeded: Map<string, string> };

type TableDef = { validator: { json: Json } };
const tables = (schema as unknown as { tables: Record<string, TableDef> })
  .tables;

/** Workspace-owned tables: the ones whose records carry a tenantId. */
const tenantTables = Object.entries(tables)
  .filter(([, def]) => {
    const json = def.validator.json;
    return json.type === "object" && "tenantId" in json.value;
  })
  .map(([name]) => name);

/** The table a text link field names (eventId -> events, personId -> people). */
function tableFor(field: string, seeded: Map<string, string>): string | null {
  const match = /^(.+?)Ids?$/.exec(field);
  if (!match || field === "tenantId") return null;
  const base = match[1]!;
  const candidates =
    base === "person"
      ? ["people"]
      : [`${base}s`, `${base}es`, `${base.replace(/y$/, "ie")}s`, base];
  return candidates.find((name) => seeded.has(name)) ?? null;
}

/** One deterministic value for a field rule; used for records AND arguments. */
function fill(rule: Json, field: string, side: Side): unknown {
  switch (rule.type) {
    case "string": {
      if (field === "tenantId") return side.tenant;
      const table = tableFor(field, side.seeded);
      return table ? side.seeded.get(table) : MARK;
    }
    case "number":
      return NUMBER[side.tenant];
    case "bigint":
      return BigInt(NUMBER[side.tenant]!);
    case "boolean":
      return false;
    case "null":
      return null;
    case "any":
      return MARK;
    case "bytes":
      return new ArrayBuffer(1);
    case "id":
      return side.seeded.get(rule.tableName) ?? `7${rule.tableName}`;
    case "literal":
      return rule.value;
    case "array": {
      const item = rule.value;
      const names =
        item.type === "id" ||
        (item.type === "string" && tableFor(field, side.seeded) !== null);
      return names ? [fill(item, field, side)] : [];
    }
    case "record":
      return {};
    case "union": {
      const first = rule.value.find((m) => m.type !== "null") ?? rule.value[0]!;
      return fill(first, field, side);
    }
    case "object": {
      const out: Doc = {};
      for (const [key, spec] of Object.entries(rule.value)) {
        if (spec.optional) continue;
        out[key] = fill(spec.fieldType, key, side);
      }
      return out;
    }
  }
}

type Entry = { path: string; kind: "query" | "mutation"; args: Json | null };

async function publicFunctions(): Promise<Entry[]> {
  const out: Entry[] = [];
  for (const [file, load] of Object.entries(modules)) {
    const rel = file.replace(/^\.\.\/\.\.\/convex\//, "");
    if (rel.startsWith("_generated/") || rel === "schema.ts") continue;
    if (rel.endsWith(".d.ts") || rel === "crons.ts" || rel === "http.ts")
      continue;
    const mod = (await load()) as Record<string, unknown>;
    const base = rel.replace(/\.(ts|js)$/, "");
    for (const [name, value] of Object.entries(mod)) {
      const fn = value as Fn | null;
      if (!fn || (typeof fn !== "function" && typeof fn !== "object")) continue;
      if (!fn.isPublic) continue;
      const kind = fn.isQuery ? "query" : fn.isMutation ? "mutation" : null;
      if (!kind) continue;
      const raw = fn.exportArgs?.();
      const parsed = raw ? (JSON.parse(raw) as Json) : null;
      out.push({ path: `${base}:${name}`, kind, args: parsed });
    }
  }
  return out;
}

/**
 * Functions where holding a device secret IS the permission (the push
 * endpoint only the phone knows, see convex/pushSubscriptions.ts). A caller
 * from outside does not hold workspace A's secret, so it sends another one.
 * register re-owns a browser's alerts to whoever is signed in on it now,
 * which needs the same secret address.
 */
const DEVICE_SECRET_ARGS: Record<string, string> = {
  "pushSubscriptions:releaseByEndpoint": "endpoint",
  "pushSubscriptions:register": "endpoint",
};

/** Optional arguments that name a record or a workspace. */
function linkArgs(entry: Entry, side: Side): string[] {
  const rule = entry.args;
  if (!rule || rule.type !== "object") return [];
  return Object.entries(rule.value)
    .filter(([key, spec]) => {
      if (!spec.optional) return false;
      if (key === "tenantId" || tableFor(key, side.seeded)) return true;
      const t =
        spec.fieldType.type === "union"
          ? spec.fieldType.value.find((m) => m.type !== "null")
          : spec.fieldType;
      return t?.type === "id" || (t?.type === "array" && t.value.type === "id");
    })
    .map(([key]) => key);
}

/** Arguments for one function; `extra` adds one optional argument. */
function argsFor(
  entry: Entry,
  side: Side,
  extra: string | null,
  outsider = false,
): Doc {
  const rule = entry.args;
  if (!rule || rule.type !== "object") return {};
  const out: Doc = {};
  for (const [key, spec] of Object.entries(rule.value)) {
    if (spec.optional && key !== extra) continue;
    out[key] =
      outsider && DEVICE_SECRET_ARGS[entry.path] === key
        ? "matrix-not-the-device-secret"
        : fill(spec.fieldType, key, side);
  }
  return out;
}

function variants(entry: Entry, side: Side): (string | null)[] {
  return [null, ...linkArgs(entry, side)];
}

/**
 * The website quote form is open to anyone by design: it lists the names of
 * the published company's active service styles and occasions. It must give
 * nothing else — only _id, name and sortOrder on each option.
 */
const PUBLIC_QUOTE_FORM = "quoteBuilder:getQuoteFormOptions";
function publicQuoteFormExtras(value: unknown): string[] {
  const extra: string[] = [];
  const form = (value ?? {}) as Record<string, unknown>;
  for (const [key, list] of Object.entries(form)) {
    if (key !== "serviceStyles" && key !== "occasions") extra.push(key);
    for (const option of Array.isArray(list) ? (list as Doc[]) : []) {
      for (const field of Object.keys(option)) {
        if (!["_id", "name", "sortOrder"].includes(field))
          extra.push(`${key}.${field}`);
      }
    }
  }
  return extra;
}

function personRow(side: Side, extra: Doc): Doc {
  return {
    ...(fill(tables.people!.validator.json, "", side) as Doc),
    tenantId: side.tenant,
    ...extra,
  };
}

/** One record per workspace table; links resolved to this workspace's records. */
async function seedSide(t: Harness, side: Side): Promise<string[]> {
  const failed: string[] = [];
  for (const table of tenantTables) {
    const doc = fill(tables[table]!.validator.json, "", side) as Doc;
    doc.tenantId = side.tenant;
    try {
      const id = await t.run((ctx) =>
        ctx.db.insert(table as never, doc as never),
      );
      side.seeded.set(table, id as string);
    } catch (error) {
      failed.push(`${table}: ${String(error).split("\n")[0]}`);
    }
  }
  // Second pass: every link now points at this workspace's own records.
  for (const [table, id] of side.seeded) {
    const doc = fill(tables[table]!.validator.json, "", side) as Doc;
    doc.tenantId = side.tenant;
    // Keep the seeded area switch on, so the probes are not all stopped by it.
    if (table === "organizationCapabilitySettings") doc.enabled = true;
    try {
      await t.run((ctx) => ctx.db.replace(id as never, doc as never));
    } catch (error) {
      failed.push(`${table} links: ${String(error).split("\n")[0]}`);
    }
  }
  return failed;
}

/** Workspace B always; workspace A only when `withA`. B goes first so its ids match. */
async function makeWorld(withA: boolean) {
  const t = convexTest(schema, modules);
  const b: Side = { tenant: TENANT_B, seeded: new Map() };
  const a: Side = { tenant: TENANT_A, seeded: new Map() };
  const failed = await seedSide(t, b);
  for (const role of ROLES) {
    await t.run((ctx) =>
      ctx.db.insert(
        "people" as never,
        personRow(b, {
          authSubjectId: `matrix-${role}-b`,
          role,
          status: "active",
        }) as never,
      ),
    );
  }
  if (withA) {
    failed.push(...(await seedSide(t, a)));
    await t.run(async (ctx) => {
      // A removed staff profile, still linked to a sign-in.
      await ctx.db.insert(
        "people" as never,
        personRow(a, {
          authSubjectId: "matrix-removed-a",
          role: "owner",
          status: "inactive",
        }) as never,
      );
      await ctx.db.insert(
        "people" as never,
        personRow(a, {
          authSubjectId: "matrix-owner-a",
          role: "owner",
          status: "active",
        }) as never,
      );
    });
  }
  return { t, a, b, failed };
}

type Caller = { label: string; identity: Doc | null };

const OUTSIDERS: Caller[] = [
  ...ROLES.map((role) => ({
    label: `workspace B ${role}`,
    identity: {
      subject: `matrix-${role}-b`,
      tokenIdentifier: `matrix|${role}-b`,
      tenantId: TENANT_B,
    },
  })),
  {
    label: "workspace B owner sign-in with no staff profile",
    identity: {
      subject: "matrix-unlinked-b",
      tokenIdentifier: "matrix|unlinked-b",
      role: "owner",
      tenantId: TENANT_B,
    },
  },
  { label: "signed out", identity: null },
  {
    label: "removed person of workspace A",
    identity: {
      subject: "matrix-removed-a",
      tokenIdentifier: "matrix|removed-a",
    },
  },
];

const OWNER_A: Caller = {
  label: "workspace A owner",
  identity: {
    subject: "matrix-owner-a",
    tokenIdentifier: "matrix|owner-a",
    role: "owner",
    tenantId: TENANT_A,
  },
};

function as(t: Harness, caller: Caller): Harness {
  return caller.identity
    ? (t.withIdentity(caller.identity as never) as Harness)
    : t;
}

type Outcome = { value: unknown } | { error: string };

async function run(h: Harness, entry: Entry, args: Doc): Promise<Outcome> {
  try {
    const value =
      entry.kind === "query"
        ? await h.query(makeFunctionReference<"query">(entry.path), args)
        : await h.mutation(makeFunctionReference<"mutation">(entry.path), args);
    return { value };
  } catch (error) {
    return { error: String(error).split("\n")[0]! };
  }
}

function show(outcome: Outcome): string {
  return "value" in outcome
    ? `value ${JSON.stringify(outcome.value, (_k, v: unknown) =>
        typeof v === "bigint"
          ? `${v}n`
          : v instanceof ArrayBuffer
            ? "bytes"
            : v,
      )}`
    : `error ${outcome.error}`;
}

/** Workspace A's records as one comparable text. */
async function stateOfA(t: Harness): Promise<Map<string, string>> {
  const snap = new Map<string, string>();
  const rows = await t.run(async (ctx) => {
    const all: Doc[] = [];
    for (const table of tenantTables) {
      all.push(...((await ctx.db.query(table as never).collect()) as Doc[]));
    }
    return all;
  });
  for (const row of rows) {
    if (row.tenantId !== TENANT_A) continue;
    snap.set(String(row._id), show({ value: row }));
  }
  return snap;
}

function changes(before: Map<string, string>, after: Map<string, string>) {
  const out: string[] = [];
  for (const [id, row] of after) {
    if (!before.has(id)) out.push(`added ${id}`);
    else if (before.get(id) !== row) out.push(`changed ${id}`);
  }
  for (const id of before.keys()) if (!after.has(id)) out.push(`removed ${id}`);
  return out;
}

type Ledger = { reads: Record<string, string>; writes: Record<string, string> };

describe("PL-AUTH workspace and role matrix (AC-151 / PR12-10)", () => {
  it(
    "no role of another workspace, no signed-out caller and no removed person reads or changes workspace A records",
    async () => {
      const full = await makeWorld(true);
      const empty = await makeWorld(false);
      expect([...full.failed, ...empty.failed]).toEqual([]);
      const a = full.a;
      const ids = [...a.seeded.values(), ...full.b.seeded.values()];
      const plain = (text: string) =>
        ids.reduce((out, id) => out.split(id).join("<id>"), text).slice(0, 300);

      const entries = await publicFunctions();
      const queries = entries.filter((e) => e.kind === "query");
      const mutations = entries.filter((e) => e.kind === "mutation");
      const ledger: Ledger = { reads: {}, writes: {} };

      // Reads: same answer with and without workspace A's records.
      const readLeaks: string[] = [];
      let readProbes = 0;
      for (const caller of OUTSIDERS) {
        const withA = as(full.t, caller);
        const withoutA = as(empty.t, caller);
        for (const entry of queries) {
          for (const extra of variants(entry, a)) {
            const args = argsFor(entry, a, extra);
            const r1 = await run(withA, entry, args);
            readProbes += 1;
            const where = `${caller.label} -> ${entry.path}${extra ? ` [${extra}]` : ""}`;
            if (entry.path === PUBLIC_QUOTE_FORM) {
              const extraFields =
                "value" in r1 ? publicQuoteFormExtras(r1.value) : [];
              if (extraFields.length > 0)
                readLeaks.push(`${where} (${extraFields.join(", ")})`);
              continue;
            }
            const r0 = await run(withoutA, entry, args);
            if (show(r1) !== show(r0))
              readLeaks.push(
                `${where}: with A ${plain(show(r1))} | without A ${plain(show(r0))}`,
              );
          }
        }
      }

      // Ledger: does each read find workspace A's records for A's own owner?
      const ownerWith = as(full.t, OWNER_A);
      const ownerWithout = as(empty.t, OWNER_A);
      for (const entry of queries) {
        let reason = "";
        for (const extra of variants(entry, a)) {
          const args = argsFor(entry, a, extra);
          const r1 = await run(ownerWith, entry, args);
          const r0 = await run(ownerWithout, entry, args);
          if ("value" in r1 && show(r1) !== show(r0)) {
            reason = `reaches workspace A records${extra ? ` via ${extra}` : ""}`;
            break;
          }
          reason ||=
            "error" in r1
              ? `no owner reach: ${plain(r1.error)}`
              : "no owner reach: same answer with or without workspace A records";
        }
        ledger.reads[entry.path] = reason;
      }

      // Writes: no outside caller changes, removes or adds a workspace A record.
      const writeLeaks: string[] = [];
      let writeProbes = 0;
      for (const caller of OUTSIDERS) {
        const h = as(full.t, caller);
        const before = await stateOfA(full.t);
        for (const entry of mutations) {
          for (const extra of variants(entry, a)) {
            await run(h, entry, argsFor(entry, a, extra, true));
            writeProbes += 1;
          }
        }
        for (const change of changes(before, await stateOfA(full.t)))
          writeLeaks.push(`${caller.label}: ${change}`);
      }

      // Ledger: does each write change workspace A records for A's own owner?
      const own = await makeWorld(true);
      const owner = as(own.t, OWNER_A);
      let current = await stateOfA(own.t);
      for (const entry of mutations) {
        let reason = "";
        for (const extra of variants(entry, own.a)) {
          const out = await run(owner, entry, argsFor(entry, own.a, extra));
          if ("value" in out) {
            const next = await stateOfA(own.t);
            const changed = changes(current, next).length > 0;
            current = next;
            if (changed) {
              reason = `changes workspace A records${extra ? ` via ${extra}` : ""}`;
              break;
            }
            reason ||=
              "no owner change: ran without changing workspace A records";
          } else {
            const ownIds = [...own.a.seeded.values(), ...own.b.seeded.values()];
            const text = ownIds.reduce(
              (s, id) => s.split(id).join("<id>"),
              out.error,
            );
            reason ||= `no owner change: ${text.slice(0, 300)}`;
          }
        }
        ledger.writes[entry.path] = reason;
      }

      const reached = (map: Record<string, string>) =>
        Object.values(map).filter((r) => !r.startsWith("no owner")).length;
      console.log(
        `matrix: ${tenantTables.length} tables; ${queries.length} reads (${reached(ledger.reads)} reach A for its owner), ${readProbes} outside read probes; ${mutations.length} writes (${reached(ledger.writes)} change A for its owner), ${writeProbes} outside write probes`,
      );

      const refresh =
        process.env.UPDATE_MATRIX_LEDGER ||
        !existsSync(LEDGER_PATH) ||
        readFileSync(LEDGER_PATH, "utf8").trim() === "";
      if (refresh) {
        const sorted = (m: Record<string, string>) =>
          Object.fromEntries(
            Object.entries(m).sort(([x], [y]) => x.localeCompare(y)),
          );
        writeFileSync(
          LEDGER_PATH,
          `${JSON.stringify({ reads: sorted(ledger.reads), writes: sorted(ledger.writes) }, null, 2)}\n`,
        );
      }
      const committed = JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as Ledger;
      const lostReach: string[] = [];
      for (const kind of ["reads", "writes"] as const) {
        for (const [path, reason] of Object.entries(committed[kind])) {
          const now = ledger[kind][path];
          // A removed function drops out; a kept one must keep reaching.
          if (
            now &&
            !reason.startsWith("no owner") &&
            now.startsWith("no owner")
          )
            lostReach.push(`${kind} ${path}: was "${reason}", now "${now}"`);
        }
      }

      expect(readLeaks).toEqual([]);
      expect(writeLeaks).toEqual([]);
      expect(lostReach).toEqual([]);
    },
    60 * 60 * 1000,
  );
});
