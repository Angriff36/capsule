/**
 * PL-AUTH (AC-151): make every public generated mutation refuse record ids of
 * another workspace (see convex/lib/ownWorkspaceLinks.ts). The Convex
 * projection stores caller-sent link ids without looking them up, so this
 * runs after Builder regeneration, alongside the other generated runtime
 * patches, and refreshes the generated surface's ownership digest.
 *
 * Which inputs are links comes from the Manifest IR (generated/ir/merged.ir.json):
 * a command parameter of type uuid or list of uuid, or one that fills a
 * declared ref / belongsTo link field of its entity. Other text inputs are
 * never checked, so codes and outside-system ids pass untouched.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "convex/mutations.ts";
const IR = "generated/ir/merged.ir.json";

const IMPORT_ANCHOR = 'import { getAuthContext } from "./lib/authContext";\n';
const IMPORT =
  'import { assertOwnWorkspaceLinks as __assertOwnWorkspaceLinks } from "./lib/ownWorkspaceLinks";\n';
const HANDLER = /^ {2}handler: async \(ctx, args(?:: any)?\) => \{\n/m;

/**
 * The generated idempotency cache is keyed by the caller's key alone and is
 * read before the step's role checks. Every lookup and store goes through
 * convex/lib/commandIdempotency.ts, which scopes the key to the caller's
 * workspace, sign-in, staff profile, role and switched-off areas, and the key
 * is worked out ONCE before the step runs (a step that changes its caller's
 * own access must not save under the changed access).
 */
const SCOPE_IMPORT =
  'import { scopedCommandKey as __scopedCommandKey } from "./lib/commandIdempotency";\n';
const MUTATION_START = /^export const (\w+) = mutation\(\{$/gm;
const GET_BLOCK =
  "    if (args.idempotencyKey !== undefined) {\n      const __cached = await __getCommandIdempotency(ctx, args.idempotencyKey);\n";
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
    foreignKey?: { fields: string[] };
  }[];
};

/** The entity's own link fields: its ref / belongsTo foreign keys. */
function linkFields(entity: IrEntity | undefined): Set<string> {
  const fields = new Set<string>();
  for (const r of entity?.relationships ?? []) {
    if (r.kind !== "belongsTo" && r.kind !== "ref") continue;
    for (const field of r.foreignKey?.fields ?? [`${r.name}Id`]) {
      if (field !== "tenantId") fields.add(field);
    }
  }
  return fields;
}

/**
 * Mutation name -> names of its inputs the Manifest declares as record links:
 * typed uuid / list of uuid, or named like one of the entity's own link fields.
 */
function linkParams(root: string): Map<string, string[]> {
  const ir = JSON.parse(readFileSync(join(root, IR), "utf8")) as {
    commands: IrCommand[];
    entities: IrEntity[];
  };
  const entities = new Map(ir.entities.map((e) => [e.name, e]));
  const out = new Map<string, string[]>();
  for (const command of ir.commands) {
    const fields = linkFields(entities.get(command.entity));
    const links = command.parameters
      .filter((p) => isLink(p.type) || fields.has(p.name))
      .map((p) => p.name);
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

function patchMutations(source: string, links: Map<string, string[]>): string {
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
    if (names.length > 0) {
      block = block.replace(
        HANDLER,
        (line) =>
          `${line}    await __assertOwnWorkspaceLinks(ctx, args, ${JSON.stringify(names)});\n`,
      );
    }
    if (block.includes(GET_BLOCK)) {
      block = block
        .replace(
          GET_BLOCK,
          `    const __idemKey = args.idempotencyKey === undefined ? null : await __scopedCommandKey(ctx, "${name}", args.idempotencyKey);\n    if (__idemKey !== null) {\n      const __cached = await __getCommandIdempotency(ctx, __idemKey);\n`,
        )
        .replace(SET_BLOCK, (_call, a: string, b: string, command: string) => {
          if (command !== name) {
            throw new Error(
              `apply-own-workspace-links: ${name} saves its answer as ${command}`,
            );
          }
          return `${a}if (__idemKey !== null) {\n${b}await __setCommandIdempotency(ctx, __idemKey, "${name}", `;
        });
    }
    out += block;
  }
  if (
    /args\.idempotencyKey !== undefined\) \{|CommandIdempotency\(ctx, args\.idempotencyKey/.test(
      out,
    )
  ) {
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
