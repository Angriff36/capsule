/**
 * Payroll slice Manifest integration guard — thin wrapper over Manifest
 * proof-kit. Owned tables / lifecycle rules come from
 * generated/proof/guard.payroll.json.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  runManifestIntegrationGuard,
  type GuardViolation,
  type IntegrationGuardConfig,
} from "@angriff36/manifest/proof-kit";

export type PayrollManifestViolation = GuardViolation;

const GUARD_PATH = "generated/proof/guard.payroll.json";

function loadGuardConfig(root: string): IntegrationGuardConfig {
  const abs = path.join(root, GUARD_PATH);
  if (!existsSync(abs)) {
    throw new Error(`Missing ${GUARD_PATH}. Run: bun run proof:emit`);
  }
  return JSON.parse(readFileSync(abs, "utf8")) as IntegrationGuardConfig;
}

export function inspectPayrollSource(
  relativePath: string,
  source: string,
): PayrollManifestViolation[] {
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

  if (file.includes("/src/features/finance/Payroll")) {
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const imported = match[1]!;
      for (const pattern of config.forbiddenImportPatterns) {
        if (new RegExp(pattern).test(imported)) {
          violations.push({
            file,
            rule: "approved-api-path",
            detail:
              "Payroll features must use generated React hooks and governed commands.",
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
        detail: "Payroll features must not construct Convex hooks directly.",
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
          "Payroll lifecycle transitions must come from generated metadata.",
      });
    }
    for (const policy of config.lifecyclePolicies) {
      if (!file.endsWith(policy.pathSuffix)) continue;
      if (!source.includes(policy.bindingsImport)) {
        violations.push({
          file,
          rule: "generated-lifecycle",
          detail:
            "PayrollLifecyclePolicy must consume generated lifecycle metadata.",
        });
      }
      for (const symbol of policy.requiredSymbols) {
        if (!source.includes(symbol)) {
          violations.push({
            file,
            rule: "generated-lifecycle",
            detail:
              "PayrollLifecyclePolicy must consume generated lifecycle metadata.",
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
          "Authored Convex modules must write PayrollInput through generated commands.",
      });
    }
  }

  return violations.map((v) => ({
    ...v,
    rule:
      v.rule === "approved-api-path"
        ? "approved-payroll-api-path"
        : v.rule === "generated-writes-only"
          ? "generated-payroll-writes-only"
          : v.rule === "generated-lifecycle"
            ? "generated-payroll-lifecycle"
            : v.rule,
  })) as PayrollManifestViolation[];
}

export function inspectPayrollManifestIntegration(
  root = process.cwd(),
): PayrollManifestViolation[] {
  const config = loadGuardConfig(root);
  const fromEngine = runManifestIntegrationGuard(root, config).filter((v) =>
    v.file.includes("Payroll"),
  );
  const policyRel = "src/features/finance/PayrollLifecyclePolicy.ts";
  const policyAbs = path.join(root, policyRel);
  const fromPolicy = existsSync(policyAbs)
    ? inspectOne(policyRel, readFileSync(policyAbs, "utf8"), config)
    : [];
  return [...fromEngine, ...fromPolicy].map((v) => ({
    ...v,
    rule:
      v.rule === "approved-api-path"
        ? "approved-payroll-api-path"
        : v.rule === "generated-writes-only"
          ? "generated-payroll-writes-only"
          : v.rule === "generated-lifecycle"
            ? "generated-payroll-lifecycle"
            : v.rule,
  })) as PayrollManifestViolation[];
}

if (import.meta.main) {
  const violations = inspectPayrollManifestIntegration();
  if (violations.length) {
    console.error("Payroll Manifest integration guard failed:");
    for (const item of violations) {
      const loc = item.line ? `:${item.line}` : "";
      console.error(`- ${item.file}${loc}: [${item.rule}] ${item.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      "Payroll Manifest integration guard passed: generated lifecycle metadata remains authoritative.",
    );
  }
}
