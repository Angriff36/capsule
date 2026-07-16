import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export interface SupplyManifestViolation {
  file: string;
  rule:
    | "approved-supply-api-path"
    | "generated-supply-writes-only"
    | "generated-supply-lifecycle";
  detail: string;
}

const TABLES = [
  "storageLocations",
  "inventoryItems",
  "inventoryReservations",
  "ingredientDemands",
  "purchaseNeeds",
  "vendors",
  "vendorOrders",
  "vendorOrderLines",
] as const;
const TABLE_PATTERN = TABLES.join("|");

function normalized(relativePath: string) {
  return relativePath.replaceAll("\\", "/");
}

function authoredTypeScriptFiles(root: string, relativeDir: string): string[] {
  return readdirSync(path.join(root, relativeDir), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const relativePath = normalized(path.join(relativeDir, entry.name));
    if (entry.isDirectory()) return authoredTypeScriptFiles(root, relativePath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [relativePath] : [];
  });
}

function violation(
  file: string,
  rule: SupplyManifestViolation["rule"],
  detail: string,
): SupplyManifestViolation {
  return { file: normalized(file), rule, detail };
}

function inspectFeature(
  relativePath: string,
  source: string,
): SupplyManifestViolation[] {
  const violations: SupplyManifestViolation[] = [];
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
  for (const imported of imports) {
    if (
      /(?:^|\/)convex\/(?:queries|mutations)(?:\.|$|\/)/.test(imported) ||
      /(?:^|\/)convex\/_generated(?:\/|$)/.test(imported) ||
      imported === "convex/react"
    ) {
      violations.push(
        violation(
          relativePath,
          "approved-supply-api-path",
          "Inventory features must use generated React hooks and governed commands.",
        ),
      );
    }
  }
  if (/\b(?:useMutation|useQuery|useAction)\s*\(/.test(source)) {
    violations.push(
      violation(
        relativePath,
        "approved-supply-api-path",
        "Inventory features must not construct Convex hooks directly.",
      ),
    );
  }
  if (
    /\b(?:from|to)\s*:\s*["'](?:pending|calculated|confirmed|fulfilled|superseded|active|released|consumed|open|ordered|cancelled|draft|submitted|partially_received|received)["']/.test(
      source,
    )
  ) {
    violations.push(
      violation(
        relativePath,
        "generated-supply-lifecycle",
        "Supply lifecycle transitions must come from generated metadata.",
      ),
    );
  }
  if (
    relativePath.endsWith("/SupplyLifecyclePolicy.ts") &&
    (!source.includes('../../generated/manifest-wiring-bindings"') ||
      !source.includes("IngredientDemandConfirmLifecycle") ||
      !source.includes("VendorOrderSubmitLifecycle"))
  ) {
    violations.push(
      violation(
        relativePath,
        "generated-supply-lifecycle",
        "SupplyLifecyclePolicy must consume generated lifecycle metadata.",
      ),
    );
  }
  return violations;
}

function referencesSupplyDocument(source: string): boolean {
  return new RegExp(
    `(?:v\\.id\\(\\s*["'](?:${TABLE_PATTERN})["']|Id<\\s*["'](?:${TABLE_PATTERN})["']|ctx\\.db\\.(?:get|query|insert)\\(\\s*["'](?:${TABLE_PATTERN})["'])`,
  ).test(source);
}

function inspectConvex(
  relativePath: string,
  source: string,
): SupplyManifestViolation[] {
  const directInsert = new RegExp(
    `ctx\\.db\\.insert\\(\\s*["'](?:${TABLE_PATTERN})["']`,
  );
  if (
    directInsert.test(source) ||
    (/ctx\.db\.(?:patch|replace|delete)\s*\(/.test(source) &&
      referencesSupplyDocument(source))
  ) {
    return [
      violation(
        relativePath,
        "generated-supply-writes-only",
        "Authored Convex modules must write Inventory and Procurement documents through generated commands.",
      ),
    ];
  }
  return [];
}

export function inspectSupplySource(
  relativePath: string,
  source: string,
): SupplyManifestViolation[] {
  const file = `/${normalized(relativePath).replace(/^\/+/, "")}`;
  if (file.includes("/src/features/inventory/"))
    return inspectFeature(file, source);
  if (file.includes("/convex/lib/")) return inspectConvex(file, source);
  return [];
}

export function inspectSupplyManifestIntegration(
  root = process.cwd(),
): SupplyManifestViolation[] {
  const files = [
    ...authoredTypeScriptFiles(root, "src/features/inventory"),
    ...authoredTypeScriptFiles(root, "convex/lib"),
  ];
  return files.flatMap((relativePath) =>
    inspectSupplySource(
      `/${relativePath}`,
      readFileSync(path.join(root, relativePath), "utf8"),
    ),
  );
}

if (import.meta.main) {
  const violations = inspectSupplyManifestIntegration();
  if (violations.length) {
    console.error("Supply Manifest integration guard failed:");
    for (const item of violations) {
      console.error(`- ${item.file}: [${item.rule}] ${item.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      "Supply Manifest integration guard passed: generated APIs and lifecycle metadata remain authoritative.",
    );
  }
}
