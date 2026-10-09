/**
 * Command parameter schemas must accept Convex record ids. The Manifest zod
 * projection relaxes a `uuid` parameter to `z.string().min(1)` only when its
 * name is a relationship foreign key; other id parameters (makeUpForBatchId,
 * targetThreadId, sourceEventId…) keep `z.string().uuid()`, which rejects
 * every Convex id, so the browser refused the step before sending it
 * ("One or more fields are missing or invalid"). Capsule stores no RFC uuids,
 * so this runs after Builder regeneration and relaxes every uuid inside a
 * `…ParamsSchema` block. Entity row schemas are left as generated.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "schemas/manifest-schemas.ts";
const PARAMS_BLOCK =
  /(export const \w+ParamsSchema = z\.object\(\{\n)([\s\S]*?)(\n\}\);)/g;

export function relaxParamIds(source: string): string {
  return source.replace(
    PARAMS_BLOCK,
    (_all, head: string, body: string, tail: string) =>
      `${head}${body.replaceAll("z.string().uuid()", "z.string().min(1)")}${tail}`,
  );
}

export function applyOpaqueIdParams(root: string = ROOT): string[] {
  const abs = join(root, TARGET);
  if (!existsSync(abs)) return [];
  const source = readFileSync(abs, "utf8");
  const updated = relaxParamIds(source);
  if (updated === source) return [];
  writeFileSync(abs, updated, "utf8");
  const ownershipPath = join(root, ".builder", "ownership.json");
  if (existsSync(ownershipPath)) {
    const ownership = JSON.parse(readFileSync(ownershipPath, "utf8")) as {
      files: Record<string, { sha256: string; baselined?: boolean }>;
    };
    if (ownership.files[TARGET]) {
      ownership.files[TARGET] = {
        sha256: createHash("sha256").update(updated).digest("hex"),
      };
      writeFileSync(
        ownershipPath,
        `${JSON.stringify(ownership, null, 2)}\n`,
        "utf8",
      );
    }
  }
  return [TARGET];
}

if (import.meta.main) {
  const touched = applyOpaqueIdParams();
  console.log(
    touched.length === 0 ? "opaque id params: nothing to change" : touched[0],
  );
}
