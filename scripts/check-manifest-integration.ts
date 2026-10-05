/**
 * Manifest integration guards for every authored domain (2026-09-25).
 *
 * One runner over generated/proof/guard.<domain>.json (emitted by
 * scripts/emit-proof-kit.ts) and Manifest's proof-kit engine. Replaces the
 * nine per-domain check-*-manifest-integration.ts scripts; rule names keep the
 * per-domain spelling those scripts reported (e.g. approved-event-api-path).
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  runManifestIntegrationGuard,
  type GuardViolation,
  type IntegrationGuardConfig,
} from "@angriff36/manifest/proof-kit";

const GUARD_DIR = path.join("generated", "proof");
const GUARD_FILE = /^guard\.([a-z]+)\.json$/;

export type ManifestIntegrationViolation = GuardViolation & { domain: string };

/** Domains with an emitted guard config, in stable order. */
export function guardDomains(root = process.cwd()): string[] {
  const dir = path.join(root, GUARD_DIR);
  if (!existsSync(dir)) {
    throw new Error(`Missing ${GUARD_DIR}. Run: bun run proof:emit`);
  }
  return readdirSync(dir)
    .map((name) => GUARD_FILE.exec(name)?.[1])
    .filter((domain): domain is string => domain !== undefined)
    .sort();
}

function loadGuardConfig(root: string, domain: string): IntegrationGuardConfig {
  const file = path.join(root, GUARD_DIR, `guard.${domain}.json`);
  if (!existsSync(file)) {
    throw new Error(
      `Missing ${path.relative(root, file)}. Run: bun run proof:emit`,
    );
  }
  return JSON.parse(readFileSync(file, "utf8")) as IntegrationGuardConfig;
}

/** Engine rule → the per-domain rule name the old guards reported. */
function domainRule(domain: string, rule: string): string {
  if (rule === "approved-api-path") return `approved-${domain}-api-path`;
  if (rule === "generated-writes-only")
    return `generated-${domain}-writes-only`;
  if (rule === "generated-lifecycle") {
    return domain === "event"
      ? "generated-lifecycle-metadata"
      : `generated-${domain}-lifecycle`;
  }
  return rule;
}

function tag(
  domain: string,
  violations: GuardViolation[],
): ManifestIntegrationViolation[] {
  return violations.map((violation) => ({
    ...violation,
    domain,
    rule: domainRule(domain, violation.rule),
  }));
}

/**
 * Closeout and Payroll share the finance feature root with Commercial, so
 * their feature-file findings are kept only for files named after the domain
 * (as their original guards did). Their convex/lib write rule applies to
 * every authored module: the original single-file checks and tests enforced
 * that, while the original repo-wide runs also dropped non-matching
 * convex/lib files (2026-09-25).
 */
const DOMAIN_FEATURE_SCOPE: Readonly<Record<string, string>> = {
  closeout: "Closeout",
  payroll: "Payroll",
};

function inScope(domain: string, violation: GuardViolation): boolean {
  const scope = DOMAIN_FEATURE_SCOPE[domain];
  if (scope === undefined) return true;
  if (violation.rule === "generated-writes-only") return true;
  return violation.file.includes(scope);
}

export function inspectManifestIntegration(
  domain: string,
  root = process.cwd(),
): ManifestIntegrationViolation[] {
  return tag(
    domain,
    runManifestIntegrationGuard(root, loadGuardConfig(root, domain)).filter(
      (violation) => inScope(domain, violation),
    ),
  );
}

/**
 * Run one domain's guard over a single source file (for tests): the file is
 * placed at its relative path in an empty tree and the real engine runs.
 */
export function inspectManifestSource(
  domain: string,
  relativePath: string,
  source: string,
  root = process.cwd(),
): ManifestIntegrationViolation[] {
  const config = loadGuardConfig(root, domain);
  const scratch = mkdtempSync(path.join(tmpdir(), "manifest-guard-"));
  try {
    const rel = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    mkdirSync(path.dirname(path.join(scratch, rel)), { recursive: true });
    writeFileSync(path.join(scratch, rel), source, "utf8");
    return tag(
      domain,
      runManifestIntegrationGuard(scratch, config).filter((violation) =>
        inScope(domain, violation),
      ),
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function inspectAllManifestIntegration(
  root = process.cwd(),
): ManifestIntegrationViolation[] {
  return guardDomains(root).flatMap((domain) =>
    inspectManifestIntegration(domain, root),
  );
}

if (import.meta.main) {
  const domains = guardDomains();
  const violations = inspectAllManifestIntegration();
  if (violations.length > 0) {
    console.error("Manifest integration guard failed:");
    for (const item of violations) {
      const loc = item.line ? `:${String(item.line)}` : "";
      console.error(
        `- [${item.domain}] ${item.file}${loc}: [${item.rule}] ${item.detail}`,
      );
    }
    process.exitCode = 1;
  } else {
    console.log(
      `Manifest integration guards passed (${domains.join(", ")}): generated APIs and lifecycle metadata remain authoritative.`,
    );
  }
}
