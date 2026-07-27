import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export interface CulinaryManifestViolation {
  file: string;
  rule:
    | "approved-culinary-api-path"
    | "generated-culinary-writes-only"
    | "generated-culinary-lifecycle";
  detail: string;
}

const TABLES = [
  "ingredients",
  "components",
  "componentIngredients",
  "componentImports",
  "componentImportLines",
  "dishes",
  "menus",
  "eventDishes",
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
  rule: CulinaryManifestViolation["rule"],
  detail: string,
): CulinaryManifestViolation {
  return { file: normalized(file), rule, detail };
}

function inspectFeature(
  relativePath: string,
  source: string,
): CulinaryManifestViolation[] {
  const violations: CulinaryManifestViolation[] = [];
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
          "approved-culinary-api-path",
          "Culinary features must use generated React hooks, including governed creation hooks.",
        ),
      );
    }
  }
  if (/\b(?:useMutation|useQuery|useAction)\s*\(/.test(source)) {
    violations.push(
      violation(
        relativePath,
        "approved-culinary-api-path",
        "Culinary features must not construct Convex hooks directly.",
      ),
    );
  }
  if (
    /\b(?:from|to)\s*:\s*["'](?:draft|published|retired|active|discontinued|archived)["']/.test(
      source,
    )
  ) {
    violations.push(
      violation(
        relativePath,
        "generated-culinary-lifecycle",
        "Culinary lifecycle transitions must come from generated metadata.",
      ),
    );
  }
  if (
    relativePath.endsWith("/CulinaryLifecyclePolicy.ts") &&
    (!source.includes('../../generated/manifest-wiring-bindings"') ||
      !source.includes("ComponentPublishVersionLifecycle") ||
      !source.includes("MenuMarkPublishedLifecycle"))
  ) {
    violations.push(
      violation(
        relativePath,
        "generated-culinary-lifecycle",
        "CulinaryLifecyclePolicy must consume generated lifecycle metadata.",
      ),
    );
  }
  return violations;
}

function referencesCulinaryDocument(source: string): boolean {
  return new RegExp(
    `(?:v\\.id\\(\\s*["'](?:${TABLE_PATTERN})["']|Id<\\s*["'](?:${TABLE_PATTERN})["']|ctx\\.db\\.(?:get|query|insert)\\(\\s*["'](?:${TABLE_PATTERN})["'])`,
  ).test(source);
}

function inspectConvex(
  relativePath: string,
  source: string,
): CulinaryManifestViolation[] {
  const directInsert = new RegExp(
    `ctx\\.db\\.insert\\(\\s*["'](?:${TABLE_PATTERN})["']`,
  );
  if (
    directInsert.test(source) ||
    (/ctx\.db\.(?:patch|replace|delete)\s*\(/.test(source) &&
      referencesCulinaryDocument(source))
  ) {
    return [
      violation(
        relativePath,
        "generated-culinary-writes-only",
        "Authored Convex modules must write Culinary documents through generated commands.",
      ),
    ];
  }
  return [];
}

export function inspectCulinarySource(
  relativePath: string,
  source: string,
): CulinaryManifestViolation[] {
  const file = `/${normalized(relativePath).replace(/^\/+/, "")}`;
  if (file.includes("/src/features/kitchen/"))
    return inspectFeature(file, source);
  if (file.includes("/convex/lib/")) return inspectConvex(file, source);
  return [];
}

export function inspectCulinaryManifestIntegration(
  root = process.cwd(),
): CulinaryManifestViolation[] {
  const files = [
    ...authoredTypeScriptFiles(root, "src/features/kitchen"),
    ...authoredTypeScriptFiles(root, "convex/lib"),
  ];
  return files.flatMap((relativePath) =>
    inspectCulinarySource(
      `/${relativePath}`,
      readFileSync(path.join(root, relativePath), "utf8"),
    ),
  );
}

if (import.meta.main) {
  const violations = inspectCulinaryManifestIntegration();
  if (violations.length) {
    console.error("Culinary Manifest integration guard failed:");
    for (const item of violations) {
      console.error(`- ${item.file}: [${item.rule}] ${item.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      "Culinary Manifest integration guard passed: generated APIs and lifecycle metadata remain authoritative.",
    );
  }
}
