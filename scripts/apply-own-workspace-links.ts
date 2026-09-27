/**
 * PL-AUTH (AC-151): make every public generated mutation refuse record ids of
 * another workspace (see convex/lib/ownWorkspaceLinks.ts). The Convex
 * projection stores caller-sent link ids without looking them up, so this
 * runs after Builder regeneration, alongside the other generated runtime
 * patches, and refreshes the generated surface's ownership digest.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "convex/mutations.ts";

const IMPORT_ANCHOR = 'import { getAuthContext } from "./lib/authContext";\n';
const IMPORT =
  'import { assertOwnWorkspaceLinks as __assertOwnWorkspaceLinks } from "./lib/ownWorkspaceLinks";\n';
const HANDLER = /^ {2}handler: async \(ctx, args(?:: any)?\) => \{\n/gm;
const CALL = "    await __assertOwnWorkspaceLinks(ctx, args);\n";

/**
 * The generated idempotency cache is keyed by the caller's key alone, so a
 * caller of another workspace sending a known key got the saved answer. Every
 * lookup and store goes through convex/lib/commandIdempotency.ts, which scopes
 * the key to the caller's workspace and the step.
 */
const SCOPE_IMPORT =
  'import { scopedCommandKey as __scopedCommandKey } from "./lib/commandIdempotency";\n';
const MUTATION_START = /^export const (\w+) = mutation\(\{$/gm;
const GET_CALL = "__getCommandIdempotency(ctx, args.idempotencyKey)";
const SET_CALL =
  /__setCommandIdempotency\(ctx, args\.idempotencyKey, "(\w+)", /g;

export function applyOwnWorkspaceLinks(root: string = ROOT): string[] {
  const abs = join(root, TARGET);
  if (!existsSync(abs)) {
    throw new Error(`apply-own-workspace-links: missing ${TARGET}`);
  }
  const source = readFileSync(abs, "utf8");
  if (!source.includes(IMPORT_ANCHOR)) {
    throw new Error("apply-own-workspace-links: auth import anchor not found");
  }
  let updated = source;
  if (!updated.includes(IMPORT)) {
    const mutations = updated.match(/= mutation\(\{/g)?.length ?? 0;
    const handlers = updated.match(HANDLER)?.length ?? 0;
    if (handlers !== mutations) {
      throw new Error(
        `apply-own-workspace-links: ${String(handlers)} handlers for ${String(mutations)} mutations`,
      );
    }
    updated = updated
      .replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}${IMPORT}`)
      .replace(HANDLER, (line) => `${line}${CALL}`);
  }
  if (!updated.includes(SCOPE_IMPORT)) {
    updated = scopeIdempotencyKeys(updated);
  }
  if (updated === source) {
    refreshOwnershipDigest(root, abs);
    return [];
  }
  writeFileSync(abs, updated, "utf8");
  refreshOwnershipDigest(root, abs);
  return [TARGET];
}

function scopeIdempotencyKeys(source: string): string {
  const starts = [...source.matchAll(MUTATION_START)];
  let out = source.slice(0, starts[0]?.index ?? source.length);
  for (let i = 0; i < starts.length; i += 1) {
    const name = starts[i][1];
    const end = starts[i + 1]?.index ?? source.length;
    let block = source.slice(starts[i].index, end);
    if (block.includes(GET_CALL)) {
      block = block
        .replace(
          GET_CALL,
          `__getCommandIdempotency(ctx, await __scopedCommandKey(ctx, "${name}", args.idempotencyKey))`,
        )
        .replace(SET_CALL, (call, command: string) => {
          if (command !== name) {
            throw new Error(
              `apply-own-workspace-links: ${name} saves its answer as ${command}`,
            );
          }
          return `__setCommandIdempotency(ctx, await __scopedCommandKey(ctx, "${name}", args.idempotencyKey), "${name}", `;
        });
    }
    out += block;
  }
  if (/__(get|set)CommandIdempotency\(ctx, args\.idempotencyKey/.test(out)) {
    throw new Error(
      "apply-own-workspace-links: an unscoped idempotency lookup is left",
    );
  }
  return out.replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}${SCOPE_IMPORT}`);
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
