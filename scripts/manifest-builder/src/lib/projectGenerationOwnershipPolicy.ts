/**
 * Ownership policy for Builder-generated Convex application surfaces.
 *
 * Stock generated paths must never receive `baselined: true` — that freezes
 * stale bytes and silently blocks regen. Only explicitly declared author seams
 * may be baselined (e.g. Capsule authContext).
 */

/** Paths that may keep app customizations via `baselined: true`. */
export const BASELINEABLE_AUTHOR_SEAMS = ["convex/lib/authContext.ts"] as const;

const BASELINEABLE = new Set<string>(BASELINEABLE_AUTHOR_SEAMS);

/** Exact stock generated surfaces that must never be baselined. */
export const STOCK_GENERATED_SURFACES = [
  "convex/mutations.ts",
  "convex/queries.ts",
  "convex/schema.ts",
  "convex/http.ts",
  "convex/crons.ts",
  "convex/sagas.ts",
  "convex/computed.ts",
  "src/lib/manifest-convex-react.ts",
  "schemas/manifest-schemas.ts",
  "wiring/contract.json",
  "src/generated/manifest-wiring-bindings.ts",
  "src/generated/manifest-wiring-contract.json",
  "scripts/seed-convex.ts",
  "tests/manifest-convex.contract.test.ts",
  "manifest-context-summary.json",
  "PRESET.md",
  "package.json",
  "tsconfig.json",
  "tsconfig.builder.json",
  "vitest.config.ts",
] as const;

const STOCK = new Set<string>(STOCK_GENERATED_SURFACES);

export function isBaselineableAuthorSeam(path: string): boolean {
  return BASELINEABLE.has(path);
}

export function isStockGeneratedSurface(path: string): boolean {
  if (STOCK.has(path)) return true;
  if (path.startsWith("schemas/") && path.endsWith(".ts")) return true;
  if (path.startsWith("wiring/")) return true;
  if (path.startsWith("src/generated/")) return true;
  if (path.startsWith("diagrams/")) return true;
  return false;
}

export function canReceiveBaselinedFlag(path: string): boolean {
  return isBaselineableAuthorSeam(path);
}

export function ownershipBaselinePolicyMessage(path: string): string {
  if (isBaselineableAuthorSeam(path)) {
    return (
      `Ownership policy: ${path} is a declared author seam and may be baselined ` +
      "when on-disk bytes intentionally differ from stock Builder output."
    );
  }
  if (isStockGeneratedSurface(path)) {
    return (
      `Ownership policy: ${path} is a stock Manifest/Builder generated surface ` +
      "and cannot receive baselined:true. Capsule-specific reads belong in " +
      "separate authored Convex modules (not inside generated queries.ts / mutations.ts). " +
      `Only declared author seams may be baselined: ${BASELINEABLE_AUTHOR_SEAMS.join(", ")}.`
    );
  }
  return (
    `Ownership policy: ${path} is not a declared author seam and cannot receive baselined:true. ` +
    `Allowed seams: ${BASELINEABLE_AUTHOR_SEAMS.join(", ")}.`
  );
}

export function rejectIllegalBaseline(path: string): Error {
  return new Error(ownershipBaselinePolicyMessage(path));
}
