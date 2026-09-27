/**
 * PL-AUTH (AC-151): make every public generated mutation refuse record ids of
 * another workspace (see convex/lib/ownWorkspaceLinks.ts). The Convex
 * projection stores caller-sent link ids without looking them up, so this
 * runs after Builder regeneration, alongside the other generated runtime
 * patches, and refreshes the generated surface's ownership digest.
 *
 * Which inputs are links comes from the Manifest IR (generated/ir/merged.ir.json):
 * a declared ref / belongsTo link field of the command's entity (checked
 * against that exact table), or another uuid / list-of-uuid parameter (bare
 * uuid columns also hold outside-system ids, so only a value that resolves to
 * a record is tenant-checked). Other text inputs are never checked.
 *
 * The saved-answer (idempotency) cache is keyed by the caller's key alone in
 * generated output. This patch routes every lookup and store through
 * convex/lib/commandIdempotency.ts, which scopes the key to the caller's
 * workspace, sign-in, staff profile, role and switched-off areas, and the key
 * is worked out ONCE before the step runs (a step that changes its caller's
 * own access must not save under the changed access). Receipts saved by the
 * old single-key version cannot be attributed to a caller, so a retry that
 * hits one is refused with guidance instead of replayed or re-executed.
 *
 * The link check runs AFTER the replay lookup: a retry must get its saved
 * answer back even if one of its linked records was deleted since.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "convex/mutations.ts";
const IR = "generated/ir/merged.ir.json";
const SCHEMA = "convex/schema.ts";

const IMPORT_ANCHOR = 'import { getAuthContext } from "./lib/authContext";\n';
const IMPORT =
  'import { assertOwnWorkspaceLinks as __assertOwnWorkspaceLinks } from "./lib/ownWorkspaceLinks";\n';
const HANDLER = /^ {2}handler: async \(ctx, args(?:: any)?\) => \{\n/m;
const RUN_LINE = /^    const __result = await __run\w+\(ctx, args\);\n/m;
const LEGACY_REFUSAL =
  "This retry key was used by an earlier version of the app, so its saved answer can no longer be replayed safely. Send the request again with a new key.";

/**
 * The generated idempotency cache is keyed by the caller's key alone and is
 * read before the step's role checks. The scoped key is worked out ONCE
 * before the step runs; on a miss, a receipt saved under the raw pre-upgrade
 * key is refused (it cannot be attributed to a caller) instead of replayed
 * or re-executed.
 */
const SCOPE_IMPORT =
  'import { scopedCommandKey as __scopedCommandKey } from "./lib/commandIdempotency";\n';
const MUTATION_START = /^export const (\w+) = mutation\(\{$/gm;
const GET_BLOCK =
  "    if (args.idempotencyKey !== undefined) {\n" +
  "      const __cached = await __getCommandIdempotency(ctx, args.idempotencyKey);\n" +
  "      if (__cached !== undefined) return __cached;\n";
const SET_BLOCK =
  /( {4})if \(args\.idempotencyKey !== undefined\) \{\n( {6})await __setCommandIdempotency\(ctx, args\.idempotencyKey, "(\w+)", /;

type IrType = { name: string; generic?: IrType };
type IrCommand = {
  name: string;
  entity: string;
  parameters: { name: string; type: IrType }[];
};

function isLink(type: IrType): boolean {
  return (
    type.name === "uuid" ||
    (type.name === "list" && type.generic?.name === "uuid")
  );
}

type IrEntity = {
  name: string;
  relationships?: {
    name: string;
    kind: string;
    target?: string;
    foreignKey?: { fields: string[] };
  }[];
};

/** The entity's own link fields: its ref / belongsTo foreign keys -> target entity. */
function linkFields(entity: IrEntity | undefined): Map<string, string> {
  const fields = new Map<string, string>();
  for (const r of entity?.relationships ?? []) {
    if ((r.kind !== "belongsTo" && r.kind !== "ref") || !r.target) continue;
    for (const field of r.foreignKey?.fields ?? [`${r.name}Id`]) {
      if (field !== "tenantId") fields.set(field, r.target);
    }
  }
  return fields;
}

type LinkParam = { name: string; table: string | null };

/**
 * IR entity name -> Convex schema table name, by the Builder's naming rules
 * (camelCase plus a plural suffix). Resolved against schema.ts and REQUIRED
 * to be unique: an entity that maps to nothing or to two tables stops the
 * regen here instead of silently losing its link checks.
 */
function entityTables(root: string, entities: string[]): Map<string, string> {
  const source = readFileSync(join(root, SCHEMA), "utf8");
  const tables = new Set(
    [...source.matchAll(/(\w+): defineTable/g)].map((m) => m[1]),
  );
  // Irregular plurals the suffix rules cannot reach.
  const IRREGULAR: Record<string, string> = { Person: "people" };
  const out = new Map<string, string>();
  for (const entity of entities) {
    const camel = entity.charAt(0).toLowerCase() + entity.slice(1);
    const candidates = [camel, `${camel}s`, `${camel}es`];
    if (camel.endsWith("y")) candidates.push(`${camel.slice(0, -1)}ies`);
    if (IRREGULAR[entity]) candidates.push(IRREGULAR[entity]!);
    const hits = candidates.filter((c) => tables.has(c));
    if (hits.length !== 1) {
      throw new Error(
        `apply-own-workspace-links: entity ${entity} maps to ${hits.length} schema tables (${candidates.join(", ")}); add the naming rule`,
      );
    }
    out.set(entity, hits[0]!);
  }
  return out;
}

/**
 * Mutation name -> the inputs the Manifest declares as record links, each
 * with its expected table (null = bare uuid, outside ids allowed).
 */
function linkParams(root: string): Map<string, LinkParam[]> {
  const ir = JSON.parse(readFileSync(join(root, IR), "utf8")) as {
    commands: IrCommand[];
    entities: IrEntity[];
  };
  const entities = new Map(ir.entities.map((e) => [e.name, e]));
  const needed = new Set<string>();
  for (const entity of ir.entities) {
    for (const target of linkFields(entity).values()) needed.add(target);
  }
  const tables = entityTables(root, [...needed]);
  const out = new Map<string, LinkParam[]>();
  for (const command of ir.commands) {
    const fields = linkFields(entities.get(command.entity));
    const links: LinkParam[] = [];
    const seen = new Set<string>();
    for (const [field, target] of fields) {
      seen.add(field);
      links.push({ name: field, table: tables.get(target) ?? null });
    }
    for (const p of command.parameters) {
      if (!isLink(p.type) || seen.has(p.name)) continue;
      links.push({ name: p.name, table: null });
    }
    const cap = command.name.charAt(0).toUpperCase() + command.name.slice(1);
    out.set(`${command.entity}_${command.name}`, links);
    out.set(`${command.entity}_createVia${cap}`, links);
  }
  return out;
}

export function applyOwnWorkspaceLinks(root: string = ROOT): string[] {
  const abs = join(root, TARGET);
  if (!existsSync(abs)) {
    throw new Error(`apply-own-workspace-links: missing ${TARGET}`);
  }
  const source = readFileSync(abs, "utf8");
  if (!source.includes(IMPORT_ANCHOR)) {
    throw new Error("apply-own-workspace-links: auth import anchor not found");
  }
  const updated = source.includes(IMPORT)
    ? source
    : patchMutations(source, linkParams(root));
  if (updated !== source) writeFileSync(abs, updated, "utf8");
  refreshOwnershipDigest(root, abs);
  return updated === source ? [] : [TARGET];
}

function patchMutations(
  source: string,
  links: Map<string, LinkParam[]>,
): string {
  const starts = [...source.matchAll(MUTATION_START)];
  let out = source.slice(0, starts[0]?.index ?? source.length);
  for (let i = 0; i < starts.length; i += 1) {
    const name = starts[i][1];
    const end = starts[i + 1]?.index ?? source.length;
    let block = source.slice(starts[i].index, end);
    const names = links.get(name);
    if (!names) {
      throw new Error(
        `apply-own-workspace-links: no Manifest command for ${name}`,
      );
    }
    if (!HANDLER.test(block)) {
      throw new Error(`apply-own-workspace-links: no handler in ${name}`);
    }
    if (block.includes(GET_BLOCK)) {
      block = block
        .replace(
          GET_BLOCK,
          `    const __idemKey = args.idempotencyKey === undefined ? null : await __scopedCommandKey(ctx, "${name}", args.idempotencyKey);\n    if (__idemKey !== null) {\n      const __cached = await __getCommandIdempotency(ctx, __idemKey);\n      if (__cached !== undefined) return __cached;\n      const __legacy = await __getCommandIdempotency(ctx, args.idempotencyKey as string);\n      if (__legacy !== undefined) throw new Error(${JSON.stringify(LEGACY_REFUSAL)});\n`,
        )
        .replace(SET_BLOCK, (_call, a: string, b: string, command: string) => {
          if (command !== name) {
            throw new Error(
              `apply-own-workspace-links: ${name} saves its answer as ${command}`,
            );
          }
          return `${a}if (__idemKey !== null) {\n${b}await __setCommandIdempotency(ctx, __idemKey, "${name}", `;
        });
    } else if (
      /args\.idempotencyKey !== undefined/.test(block) ||
      /CommandIdempotency\(ctx, args\.idempotencyKey/.test(block)
    ) {
      throw new Error(
        `apply-own-workspace-links: unrecognised idempotency block in ${name}`,
      );
    }
    if (names.length > 0) {
      // Replay first, links second: a retry gets its saved answer even when a
      // linked record was deleted since.
      const assertLine = `    await __assertOwnWorkspaceLinks(ctx, args, ${JSON.stringify(names)});\n`;
      if (RUN_LINE.test(block)) {
        block = block.replace(RUN_LINE, (line) => `${assertLine}${line}`);
      } else if (
        block.includes(`throw new Error(${JSON.stringify(LEGACY_REFUSAL)})`)
      ) {
        // createVia steps inline their body: anchor right after the replay
        // prologue's closing brace instead of a delegated run call.
        const LEGACY_BLOCK =
          /^      if \(__legacy !== undefined\) throw new Error\([^\n]*\);\n    \}\n/m;
        block = block.replace(LEGACY_BLOCK, (m) => `${m}${assertLine}`);
      } else {
        block = block.replace(HANDLER, (line) => `${line}${assertLine}`);
      }
    }
    out += block;
  }
  if (/if \(args\.idempotencyKey !== undefined\) \{/.test(out)) {
    throw new Error(
      "apply-own-workspace-links: an unscoped idempotency lookup is left",
    );
  }
  return out.replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}${IMPORT}${SCOPE_IMPORT}`);
}

function refreshOwnershipDigest(root: string, abs: string): void {
  const ownershipPath = join(root, ".builder", "ownership.json");
  if (!existsSync(ownershipPath)) return;
  const ownership = JSON.parse(readFileSync(ownershipPath, "utf8")) as {
    files: Record<string, { sha256: string; baselined?: boolean }>;
  };
  const entry = ownership.files[TARGET];
  if (!entry) return;
  ownership.files[TARGET] = {
    sha256: createHash("sha256").update(readFileSync(abs)).digest("hex"),
  };
  writeFileSync(
    ownershipPath,
    `${JSON.stringify(ownership, null, 2)}\n`,
    "utf8",
  );
}

if (import.meta.main) {
  const touched = applyOwnWorkspaceLinks();
  console.log(
    touched.length === 0
      ? "own-workspace links: already applied"
      : `own-workspace links: patched ${touched.join(", ")}`,
  );
}
