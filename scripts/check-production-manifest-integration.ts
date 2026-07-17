/**
 * Production slice Manifest integration guard — thin wrapper over Manifest proof-kit.
 * Owned tables / lifecycle rules come from generated/proof/guard.production.json.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  runManifestIntegrationGuard,
  type GuardViolation,
  type IntegrationGuardConfig,
} from "@angriff36/manifest/proof-kit";

export type ProductionManifestViolation = GuardViolation;

const GUARD_PATH = "generated/proof/guard.production.json";

function loadGuardConfig(root: string): IntegrationGuardConfig {
  const abs = path.join(root, GUARD_PATH);
  if (!existsSync(abs)) {
    throw new Error(`Missing ${GUARD_PATH}. Run: bun run proof:emit`);
  }
  return JSON.parse(readFileSync(abs, "utf8")) as IntegrationGuardConfig;
}

/** Synthetic single-file checks for unit tests. */
export function inspectProductionSource(
  relativePath: string,
  source: string,
): ProductionManifestViolation[] {
  const config = loadGuardConfig(process.cwd());
  return inspectOne(relativePath, source, config);
}

function inspectOne(
  relativePath: string,
  source: string,
  config: IntegrationGuardConfig,
): GuardViolation[] {
  const file = `/${relativePath.replace(/\\/g, "/").replace(/^\/+/, "")}`;
  const violations: GuardViolation[] = [];

  if (file.includes("/src/features/production/")) {
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const imported = match[1]!;
      for (const pattern of config.forbiddenImportPatterns) {
        if (new RegExp(pattern).test(imported)) {
          violations.push({
            file,
            rule: "approved-api-path",
            detail:
              "Production features must use generated React hooks and governed commands.",
          });
        }
      }
    }
    if (
      config.forbidDirectConvexHooks &&
      /\b(?:useMutation|useQuery|useAction)\s*\(/.test(source)
    ) {
      violations.push({
        file,
        rule: "approved-api-path",
        detail: "Production features must not construct Convex hooks directly.",
      });
    }
    if (
      config.lifecycleLiteralPattern &&
      new RegExp(config.lifecycleLiteralPattern).test(source)
    ) {
      violations.push({
        file,
        rule: "generated-lifecycle",
        detail:
          "Production lifecycle transitions must come from generated metadata.",
      });
    }
    for (const policy of config.lifecyclePolicies) {
      if (!file.endsWith(policy.pathSuffix)) continue;
      if (!source.includes(policy.bindingsImport)) {
        violations.push({
          file,
          rule: "generated-lifecycle",
          detail:
            "ProductionLifecyclePolicy must consume generated lifecycle metadata.",
        });
      }
      for (const symbol of policy.requiredSymbols) {
        if (!source.includes(symbol)) {
          violations.push({
            file,
            rule: "generated-lifecycle",
            detail:
              "ProductionLifecyclePolicy must consume generated lifecycle metadata.",
          });
        }
      }
    }
  }

  if (file.includes("/convex/lib/") && config.ownedTables.length) {
    const tablePattern = config.ownedTables
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    if (
      new RegExp(`ctx\\.db\\.insert\\(\\s*["'](?:${tablePattern})["']`).test(
        source,
      )
    ) {
      violations.push({
        file,
        rule: "generated-writes-only",
        detail:
          "Authored Convex modules must write Production and Quality documents through generated commands.",
      });
    } else if (
      /ctx\.db\.(?:patch|replace|delete)\s*\(/.test(source) &&
      new RegExp(
        `(?:v\\.id\\(\\s*["'](?:${tablePattern})["']|Id<\\s*["'](?:${tablePattern})["']|ctx\\.db\\.(?:get|query|insert)\\(\\s*["'](?:${tablePattern})["'])`,
      ).test(source)
    ) {
      violations.push({
        file,
        rule: "generated-writes-only",
        detail:
          "Authored Convex modules must write Production and Quality documents through generated commands.",
      });
    }
  }

  return violations.map((v) => ({
    ...v,
    rule:
      v.rule === "approved-api-path"
        ? "approved-production-api-path"
        : v.rule === "generated-writes-only"
          ? "generated-production-writes-only"
          : v.rule === "generated-lifecycle"
            ? "generated-production-lifecycle"
            : v.rule,
  })) as ProductionManifestViolation[];
}

export function inspectProductionManifestIntegration(
  root = process.cwd(),
): ProductionManifestViolation[] {
  const config = loadGuardConfig(root);
  const violations = runManifestIntegrationGuard(root, config);
  return violations.map((v) => ({
    ...v,
    rule:
      v.rule === "approved-api-path"
        ? "approved-production-api-path"
        : v.rule === "generated-writes-only"
          ? "generated-production-writes-only"
          : v.rule === "generated-lifecycle"
            ? "generated-production-lifecycle"
            : v.rule,
  })) as ProductionManifestViolation[];
}

if (import.meta.main) {
  const violations = inspectProductionManifestIntegration();
  if (violations.length) {
    console.error("Production Manifest integration guard failed:");
    for (const item of violations) {
      const loc = item.line ? `:${item.line}` : "";
      console.error(`- ${item.file}${loc}: [${item.rule}] ${item.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      "Production Manifest integration guard passed: generated APIs and lifecycle metadata remain authoritative.",
    );
  }
}
