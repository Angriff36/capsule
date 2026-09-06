// PR12-01 / AC-028: deployment config gate (issue #265 detector).
//
//   bun scripts/check-deployment-config.ts --environment production [flags]
//
// Runs the pure checker in src/lib/deploymentConfigCheck.ts over a config
// snapshot and exits 1 when any blocker finding exists. Wired in at:
//   - scripts/vercel-build.sh  (production build gate — the deploy boundary)
//   - scripts/release.sh       (pre-flight; shell env only)
// --json prints the machine-readable report (the R2-12 release receipt's
// config-checks leg consumes it).
//
// Value sources: process.env first, then .env and .env.local from the
// working directory (unless --no-env-files; release.sh uses that flag so a
// local development .env.local can never impersonate production config).
import { readFileSync } from "node:fs";
import {
  checkDeploymentConfig,
  type DeploymentConfigInput,
  type DeploymentConfigReport,
} from "../src/lib/deploymentConfigCheck";

interface Options {
  environment: string;
  siteUrl?: string;
  expectedDeployment?: string;
  audience?: string;
  callbackUrls?: string[];
  requiredVars: string[];
  envFiles: boolean;
  envFile?: string;
  json: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    environment:
      process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    requiredVars: [],
    envFiles: true,
    json: false,
  };
  let index = 0;
  while (index < argv.length) {
    const arg = argv[index];
    const next = (): string => {
      const value = argv[index + 1];
      if (value === undefined) {
        throw new Error(`check-deployment-config: ${arg} needs a value`);
      }
      index += 1;
      return value;
    };
    switch (arg) {
      case "--environment":
        options.environment = next();
        break;
      case "--site-url":
        options.siteUrl = next();
        break;
      case "--expected-deployment":
        options.expectedDeployment = next();
        break;
      case "--audience":
        options.audience = next();
        break;
      case "--callback-urls":
        options.callbackUrls = next()
          .split(",")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0);
        break;
      case "--require":
        options.requiredVars = next()
          .split(",")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0);
        break;
      case "--env-file":
        options.envFile = next();
        break;
      case "--no-env-files":
        options.envFiles = false;
        break;
      case "--json":
        options.json = true;
        break;
      default:
        throw new Error(`check-deployment-config: unknown argument ${arg}`);
    }
    index += 1;
  }
  return options;
}

/** Minimal KEY=VALUE reader for the .env.example format (comments, blanks,
 *  optional surrounding quotes). Not a full dotenv implementation on
 *  purpose — the repo contract is this shape. */
function parseEnvFile(path: string): Map<string, string> {
  const values = new Map<string, string>();
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return values;
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line
      .slice(0, separator)
      .trim()
      .replace(/^export\s+/, "");
    const encoded = line.slice(separator + 1).trim();
    let value = encoded.replace(/^["']|["']$/g, "");
    // Vercel exports JSON-quoted values: decode escaped newlines before
    // credential validation, just as the build environment supplies them.
    if (encoded.startsWith('"') && encoded.endsWith('"')) {
      try {
        value = JSON.parse(encoded) as string;
      } catch {
        // Preserve the existing dotenv subset for non-JSON quoted values.
      }
    }
    values.set(key, value);
  }
  return values;
}

function readEnvFileValues(options: Options): Map<string, string> {
  if (options.envFile) return parseEnvFile(options.envFile);
  if (!options.envFiles) return new Map<string, string>();
  // .env first, .env.local over it — same precedence direction as Vite.
  const merged = parseEnvFile(".env");
  for (const [key, value] of parseEnvFile(".env.local")) {
    merged.set(key, value);
  }
  return merged;
}

function buildInput(
  options: Options,
  fileValues: Map<string, string>,
): DeploymentConfigInput {
  const value = (name: string): string | undefined => {
    const fromShell = process.env[name];
    if (fromShell !== undefined && fromShell !== "") return fromShell;
    return fileValues.get(name) ?? undefined;
  };
  return {
    environment: options.environment,
    allowDevelopmentAuth: value("VITE_CLERK_ALLOW_DEVELOPMENT_AUTH") === "true",
    viteConvexUrl: value("VITE_CONVEX_URL"),
    viteClerkPublishableKey: value("VITE_CLERK_PUBLISHABLE_KEY"),
    clerkJwtIssuerDomain: value("CLERK_JWT_ISSUER_DOMAIN"),
    publicAppUrl: value("CAPSULE_PUBLIC_APP_URL"),
    googleCalendarRedirectUri: value("GOOGLE_CALENDAR_REDIRECT_URI"),
    clerkPublishableKey: value("CLERK_PUBLISHABLE_KEY"),
    clerkSecretKey: value("CLERK_SECRET_KEY"),
    clerkFrontendApiUrl: value("CLERK_FRONTEND_API_URL"),
    convexFieldEncryptionKey: value("CONVEX_FIELD_ENCRYPTION_KEY"),
    expectedConvexDeployment: options.expectedDeployment,
    siteUrl: options.siteUrl,
    callbackUrls: options.callbackUrls,
    clerkJwtAudience: options.audience,
    requiredVars: options.requiredVars,
  };
}

function printHuman(report: DeploymentConfigReport): void {
  console.log(`deployment config check — environment=${report.environment}`);
  if (report.findings.length === 0) {
    console.log("OK: no config findings in the visible values.");
    return;
  }
  for (const finding of report.findings) {
    console.log(`[${finding.severity.toUpperCase()}] ${finding.code}`);
    console.log(`  ${finding.message}`);
    console.log(`  fix: ${finding.action}`);
  }
  const blockers = report.findings.filter(
    (f) => f.severity === "blocker",
  ).length;
  const warnings = report.findings.length - blockers;
  console.log(`found ${blockers} blocker(s), ${warnings} warning(s)`);
}

function main(argv: readonly string[]): number {
  let options: Options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`[check-deployment-config] ${(error as Error).message}`);
    return 2;
  }
  const report = checkDeploymentConfig(
    buildInput(options, readEnvFileValues(options)),
  );
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }
  return report.ok ? 0 : 1;
}

const exitCode = main(process.argv.slice(2));
if (exitCode !== 0) process.exit(exitCode);
