/**
 * Runtime proof (PL-AUTH, AC-151 / PR12-10 negative matrix; AC-212; AC-403):
 * one record in EVERY workspace-owned table belongs to workspace A. Then every
 * public read and write function in convex/ runs as each supported role of
 * workspace B, as a signed-out caller, and as a removed person of workspace A:
 *
 * - no read returns a workspace A record, even when the caller passes
 *   workspace A's id, a workspace A record id, or a workspace A parent id;
 * - no write changes, removes or adds a workspace A record.
 *
 * Arguments come from each function's own argument rules. The record fields
 * and the arguments use the same fill-in values, so a lookup "by field" hits
 * the workspace A record. The owner of workspace A runs the same reads as a
 * check that the probes find real records. Synthetic data only.
 */
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { beforeAll, describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

const TENANT_A = "matrix-tenant-a";
const TENANT_B = "matrix-tenant-b";
const MARK = "matrix-probe";

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

/** Same fake id for the same table every time, so parent-id lookups match. */
function fakeId(table: string): string {
  return `7${table}`;
}

/** One deterministic value for a field rule; used for records AND arguments. */
function fill(rule: Json, field: string): unknown {
  switch (rule.type) {
    case "string":
      return field === "tenantId" ? TENANT_A : MARK;
    case "number":
      return 1;
    case "bigint":
      return 1n;
    case "boolean":
      return false;
    case "null":
      return null;
    case "any":
      return MARK;
    case "bytes":
      return new ArrayBuffer(1);
    case "id":
      return fakeId(rule.tableName);
    case "literal":
      return rule.value;
    case "array":
      return [];
    case "record":
      return {};
    case "union": {
      const first = rule.value.find((m) => m.type !== "null") ?? rule.value[0]!;
      return fill(first, field);
    }
    case "object": {
      const out: Doc = {};
      for (const [key, spec] of Object.entries(rule.value)) {
        if (spec.optional) continue;
        out[key] = fill(spec.fieldType, key);
      }
      return out;
    }
  }
}

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
 */
const DEVICE_SECRET_ARGS: Record<string, string> = {
  "pushSubscriptions:releaseByEndpoint": "endpoint",
};

/** Arguments for one function: record ids point at workspace A's records. */
function argsFor(
  entry: Entry,
  seeded: Map<string, string>,
  outsider = false,
): Doc {
  const rule = entry.args;
  if (!rule || rule.type !== "object") return {};
  const out: Doc = {};
  for (const [key, spec] of Object.entries(rule.value)) {
    if (spec.optional) continue;
    const t = spec.fieldType;
    if (outsider && DEVICE_SECRET_ARGS[entry.path] === key) {
      out[key] = "matrix-not-the-device-secret";
    } else if (t.type === "id" && seeded.has(t.tableName)) {
      out[key] = seeded.get(t.tableName);
    } else {
      out[key] = fill(t, key);
    }
  }
  return out;
}

/** Does a returned value carry any workspace A record? */
function leaks(value: unknown, aIds: Set<string>, depth = 0): string | null {
  if (depth > 8 || value == null) return null;
  if (typeof value === "string") return aIds.has(value) ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = leaks(item, aIds, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value === "object") {
    const doc = value as Doc;
    if (doc.tenantId === TENANT_A) return `tenantId ${TENANT_A}`;
    for (const item of Object.values(doc)) {
      const hit = leaks(item, aIds, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * The website quote form is open to anyone by design: it lists the names of
 * the published company's active service styles and occasions. It must give
 * nothing else — only _id, name and sortOrder on each option.
 */
const PUBLIC_QUOTE_FORM = "quoteBuilder:getQuoteFormOptions";
function publicQuoteFormExtras(value: unknown): string[] {
  const extra: string[] = [];
  const form = value as Record<string, unknown>;
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

async function seedWorkspaceA(t: Harness) {
  const seeded = new Map<string, string>();
  const failed: string[] = [];
  for (const table of tenantTables) {
    const doc = fill(tables[table]!.validator.json, "") as Doc;
    doc.tenantId = TENANT_A;
    try {
      const id = await t.run((ctx) =>
        ctx.db.insert(table as never, doc as never),
      );
      seeded.set(table, id as string);
    } catch (error) {
      failed.push(`${table}: ${String(error).split("\n")[0]}`);
    }
  }
  return { seeded, failed };
}

async function snapshotA(t: Harness): Promise<Map<string, string>> {
  const snap = new Map<string, string>();
  for (const table of tenantTables) {
    const rows = await t.run((ctx) => ctx.db.query(table as never).collect());
    for (const row of rows as Doc[]) {
      if (row.tenantId !== TENANT_A) continue;
      snap.set(
        String(row._id),
        JSON.stringify(row, (_k, v: unknown) =>
          typeof v === "bigint"
            ? `${v}n`
            : v instanceof ArrayBuffer
              ? "bytes"
              : v,
        ),
      );
    }
  }
  return snap;
}

function callers(t: Harness) {
  const list: { label: string; h: Harness }[] = ROLES.map((role) => ({
    label: `workspace B ${role}`,
    h: t.withIdentity({
      subject: `matrix-${role}-b`,
      tokenIdentifier: `matrix|${role}-b`,
      role,
      tenantId: TENANT_B,
    }) as Harness,
  }));
  list.push({ label: "signed out", h: t });
  list.push({
    label: "removed person of workspace A",
    h: t.withIdentity({
      subject: "matrix-removed-a",
      tokenIdentifier: "matrix|removed-a",
    }) as Harness,
  });
  return list;
}

async function run(
  h: Harness,
  entry: Entry,
  args: Doc,
): Promise<{ value: unknown } | { error: string }> {
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

describe("PL-AUTH workspace and role matrix (AC-151 / PR12-10)", () => {
  it(
    "no role of another workspace, no signed-out caller and no removed person reads or changes workspace A records",
    async () => {
      const t = convexTest(schema, modules);
      const { seeded, failed } = await seedWorkspaceA(t);
      expect(failed).toEqual([]);

      // A removed staff profile in workspace A, still linked to a sign-in.
      await t.run((ctx) =>
        ctx.db.insert(
          "people" as never,
          {
            ...(fill(tables.people!.validator.json, "") as Doc),
            tenantId: TENANT_A,
            authSubjectId: "matrix-removed-a",
            role: "owner",
            status: "inactive",
          } as never,
        ),
      );

      const aIds = new Set(seeded.values());
      const entries = await publicFunctions();
      const queries = entries.filter((e) => e.kind === "query");
      const mutations = entries.filter((e) => e.kind === "mutation");

      // Check: workspace A's owner finds its own records through the probes.
      const owner = t.withIdentity({
        subject: "matrix-owner-a",
        tokenIdentifier: "matrix|owner-a",
        role: "owner",
        tenantId: TENANT_A,
      }) as Harness;
      let ownerHits = 0;
      for (const entry of queries) {
        const out = await run(owner, entry, argsFor(entry, seeded));
        if ("value" in out && leaks(out.value, aIds)) ownerHits += 1;
      }

      const readLeaks: string[] = [];
      for (const { label, h } of callers(t)) {
        for (const entry of queries) {
          const out = await run(h, entry, argsFor(entry, seeded));
          if (!("value" in out)) continue;
          if (entry.path === PUBLIC_QUOTE_FORM) {
            const extra = publicQuoteFormExtras(out.value);
            if (extra.length > 0)
              readLeaks.push(`${label} -> ${entry.path} (${extra.join(", ")})`);
            continue;
          }
          const hit = leaks(out.value, aIds);
          if (hit) readLeaks.push(`${label} -> ${entry.path} (${hit})`);
        }
      }

      // Not found looks the same: a workspace A record id gives an outside
      // caller exactly the answer an id that does not exist gives.
      const missing = new Map(
        [...seeded.keys()].map((table) => [table, `8${table}`]),
      );
      const hides = (text: string, ids: Iterable<string>) => {
        let out = text;
        for (const id of ids) out = out.split(id).join("<id>");
        return out;
      };
      const existenceLeaks: string[] = [];
      let idProbes = 0;
      for (const { label, h } of callers(t)) {
        for (const entry of queries) {
          const real = argsFor(entry, seeded);
          const fake = argsFor(entry, missing);
          if (JSON.stringify(real) === JSON.stringify(fake)) continue;
          idProbes += 1;
          const a = await run(h, entry, real);
          const b = await run(h, entry, fake);
          const show = (o: typeof a) =>
            "value" in o
              ? `value ${JSON.stringify(o.value)}`
              : `error ${o.error}`;
          if (
            hides(show(a), seeded.values()) !== hides(show(b), missing.values())
          )
            existenceLeaks.push(`${label} -> ${entry.path}`);
        }
      }

      const before = await snapshotA(t);
      for (const { h } of callers(t)) {
        for (const entry of mutations) {
          await run(h, entry, argsFor(entry, seeded, true));
        }
      }
      const after = await snapshotA(t);
      const writeLeaks: string[] = [];
      for (const [id, row] of after) {
        if (!before.has(id)) writeLeaks.push(`added ${id}`);
        else if (before.get(id) !== row) writeLeaks.push(`changed ${id}`);
      }
      for (const id of before.keys()) {
        if (!after.has(id)) writeLeaks.push(`removed ${id}`);
      }

      // Check: the same write probes DO change workspace A records when
      // workspace A's owner sends them (fresh copy of the same records).
      const own = convexTest(schema, modules);
      const ownSeed = await seedWorkspaceA(own);
      const ownOwner = own.withIdentity({
        subject: "matrix-owner-a",
        tokenIdentifier: "matrix|owner-a",
        role: "owner",
        tenantId: TENANT_A,
      }) as Harness;
      const ownBefore = await snapshotA(own);
      for (const entry of mutations) {
        await run(ownOwner, entry, argsFor(entry, ownSeed.seeded));
      }
      const ownAfter = await snapshotA(own);
      let ownerWrites = 0;
      for (const [id, row] of ownAfter) {
        if (ownBefore.get(id) !== row) ownerWrites += 1;
      }

      console.log(
        `matrix: ${tenantTables.length} tables, ${queries.length} reads, ${mutations.length} writes, owner read hits ${ownerHits}, owner-changed records ${ownerWrites}, record-id probes ${idProbes}`,
      );
      expect(readLeaks).toEqual([]);
      expect(existenceLeaks).toEqual([]);
      expect(writeLeaks).toEqual([]);
      expect(ownerHits).toBeGreaterThan(tenantTables.length);
      expect(ownerWrites).toBeGreaterThan(tenantTables.length / 2);
      expect(idProbes).toBeGreaterThan(tenantTables.length);
    },
    30 * 60 * 1000,
  );
});
