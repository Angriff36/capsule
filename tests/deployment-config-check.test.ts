// PR12-01 / AC-028: unit tests for the deployment config checker.
//
// The checker is pure (src/lib/deploymentConfigCheck.ts) — every fixture
// below is a synthetic snapshot, never a real credential. Key literals are
// deliberately short and obviously fake so the secret-scan gate
// (scripts/SecretScan.ts clerk-secret needs 20+ chars after sk_live_/sk_test_)
// cannot match them; messages are asserted to carry class markers only.
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkDeploymentConfig,
  EXPECTED_CONVEX_AUDIENCE,
  redactCredential,
  type DeploymentConfigFinding,
  type DeploymentConfigInput,
  type DeploymentConfigReport,
} from "../src/lib/deploymentConfigCheck";

// Synthetic credential shapes (pk_* is never scanned; sk_* stays < 20 chars).
const PK_LIVE = "pk_live_Y2xlcmsuY2Fwc3VsZS5leGFtcGxlLmNvbSQ=";
const PK_TEST = "pk_test_c29saWQtamVsbHlmaXNoLTQyLmNsZXJrLmFjY291bnRzLmRldiQ=";
const SK_LIVE = "sk_live_QxE2mV9aKv";
const SK_TEST = "sk_test_Zz91xQw4Rt";

const PROD_ORIGIN = "https://capsule.example.com";
const PROD_ISSUER = "https://clerk.capsule.example.com";
const DEV_ISSUER = "https://solid-jellyfish-42.clerk.accounts.dev";
const PROD_CONVEX = "https://impartial-mule-193.convex.cloud";

function production(
  overrides: Partial<DeploymentConfigInput> = {},
): DeploymentConfigInput {
  return {
    environment: "production",
    viteConvexUrl: PROD_CONVEX,
    viteClerkPublishableKey: PK_LIVE,
    clerkJwtIssuerDomain: PROD_ISSUER,
    publicAppUrl: PROD_ORIGIN,
    ...overrides,
  };
}

function codes(report: DeploymentConfigReport): string[] {
  return report.findings.map((finding) => finding.code);
}

function finding(
  report: DeploymentConfigReport,
  code: string,
): DeploymentConfigFinding | undefined {
  return report.findings.find((candidate) => candidate.code === code);
}

describe("deploymentConfigCheck", () => {
  it("an explicit development-auth allowance warns without hiding broken configuration", () => {
    const input = production({
      viteClerkPublishableKey: PK_TEST,
      clerkSecretKey: SK_TEST,
      clerkJwtIssuerDomain: DEV_ISSUER,
      allowDevelopmentAuth: true,
    });
    const allowed = checkDeploymentConfig(input);
    expect(allowed.ok).toBe(true);
    expect(
      finding(allowed, "clerk:dev_credential_in_production")?.severity,
    ).toBe("warning");
    expect(
      checkDeploymentConfig({ ...input, allowDevelopmentAuth: false }).ok,
    ).toBe(false);
    for (const broken of [
      { clerkSecretKey: "invalid" },
      { clerkSecretKey: "sk_test_" },
      { clerkSecretKey: PK_TEST },
      { viteClerkPublishableKey: "pk_test_" },
      { viteClerkPublishableKey: SK_TEST },
      { clerkJwtIssuerDomain: "https://different.clerk.accounts.dev" },
      { clerkSecretKey: SK_LIVE },
      { clerkJwtIssuerDomain: PROD_ISSUER },
      { viteConvexUrl: "http://localhost:3210" },
    ]) {
      expect(checkDeploymentConfig({ ...input, ...broken }).ok).toBe(false);
    }
  });

  it("rejects an undecodable publishable key even when development auth is allowed", () => {
    expect(
      checkDeploymentConfig(
        production({
          viteClerkPublishableKey: "pk_test_not_a_hostname",
          clerkJwtIssuerDomain: DEV_ISSUER,
          allowDevelopmentAuth: true,
        }),
      ).ok,
    ).toBe(false);
  });

  it("the CLI decodes Vercel-exported newline escapes without exposing a valid secret", () => {
    const directory = mkdtempSync(join(tmpdir(), "capsule-config-"));
    const path = join(directory, "production.env");
    try {
      writeFileSync(
        path,
        `CLERK_SECRET_KEY=${JSON.stringify(SK_TEST + "\n")}\nVITE_CLERK_ALLOW_DEVELOPMENT_AUTH=true\n`,
      );
      const env = { ...process.env };
      for (const name of Object.keys(env)) {
        if (
          /^(CLERK_|VITE_|CAPSULE_PUBLIC_APP_URL|GOOGLE_CALENDAR_REDIRECT_URI)/.test(
            name,
          )
        )
          delete env[name];
      }
      const result = spawnSync(
        "bun",
        [
          "scripts/check-deployment-config.ts",
          "--environment",
          "production",
          "--env-file",
          path,
          "--json",
        ],
        {
          env,
          encoding: "utf8",
          shell: process.platform === "win32",
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status, result.stdout + result.stderr).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.findings).toEqual([
        expect.objectContaining({
          code: "clerk:dev_credential_in_production",
          severity: "warning",
        }),
      ]);
      expect(result.stdout).not.toContain(SK_TEST);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("each mismatch is detected; missing config errors are redacted and actionable", () => {
    // A consistent production snapshot carries no finding at all.
    const clean = checkDeploymentConfig(production());
    expect(clean).toEqual({
      environment: "production",
      ok: true,
      findings: [],
    });

    // Every mismatch class the spec names produces its named blocker.
    const mismatchScenarios: Array<[string, Partial<DeploymentConfigInput>]> = [
      // mismatched Clerk issuer (development domain behind a live key)
      [
        "clerk:issuer_key_environment_mismatch",
        { clerkJwtIssuerDomain: DEV_ISSUER },
      ],
      // mismatched application keys (pair from different Clerk environments)
      ["clerk:keypair_environment_mismatch", { clerkSecretKey: SK_TEST }],
      // mismatched application keys (gateway key from another application)
      [
        "clerk:publishable_key_divergence",
        { clerkPublishableKey: "pk_live_DivergentK3y" },
      ],
      // issuer and frontend-api helper name different Clerk instances
      [
        "clerk:issuer_frontend_api_mismatch",
        { clerkFrontendApiUrl: "https://other-instance.example.com" },
      ],
      // mismatched Convex audience (Clerk JWT template aud ≠ applicationID)
      ["convex:audience_mismatch", { clerkJwtAudience: "not-convex" }],
      // mismatched callback URLs (production origin missing from the allowlist)
      [
        "clerk:callback_url_mismatch",
        {
          siteUrl: PROD_ORIGIN,
          callbackUrls: ["https://other-site.example.com/sign-in"],
        },
      ],
      // environment: localhost backend in production
      [
        "convex:url_local_in_production",
        { viteConvexUrl: "http://127.0.0.1:3210" },
      ],
      // environment: frontend pointed at a different Convex deployment
      [
        "convex:url_deployment_mismatch",
        { expectedConvexDeployment: "befitting-armadillo-283" },
      ],
      // environment: public app origin still localhost in production
      [
        "env:public_app_url_local_in_production",
        { publicAppUrl: "http://localhost:7811" },
      ],
      // environment: OAuth callback origin differs from the app origin
      [
        "env:redirect_origin_mismatch",
        {
          googleCalendarRedirectUri:
            "https://other-site.example.com/admin/integrations",
        },
      ],
      // environment: public app origin differs from the production site
      [
        "env:public_app_url_mismatch",
        { siteUrl: "https://capsule-tau-eight.vercel.app" },
      ],
    ];
    const allFindings: DeploymentConfigFinding[] = [];
    for (const [expectedCode, overrides] of mismatchScenarios) {
      const report = checkDeploymentConfig(production(overrides));
      allFindings.push(...report.findings);
      const hit = finding(report, expectedCode);
      expect(
        hit,
        `expected ${expectedCode} for ${JSON.stringify(overrides)}`,
      ).toBeDefined();
      expect(hit?.severity).toBe("blocker");
      expect(report.ok).toBe(false);
      expect(hit?.message.length).toBeGreaterThan(0);
      expect(hit?.action.length).toBeGreaterThan(0);
    }

    // Missing configuration: redacted AND actionable — the message names the
    // variable, the action names the owning surface.
    const missing = checkDeploymentConfig(
      production({
        viteClerkPublishableKey: null,
        clerkJwtIssuerDomain: null,
        requiredVars: [
          "VITE_CLERK_PUBLISHABLE_KEY",
          "CLERK_JWT_ISSUER_DOMAIN",
          "CONVEX_FIELD_ENCRYPTION_KEY",
        ],
      }),
    );
    allFindings.push(...missing.findings);
    const missingPk = finding(
      missing,
      "config:missing:VITE_CLERK_PUBLISHABLE_KEY",
    );
    expect(missingPk?.severity).toBe("blocker");
    expect(missingPk?.message).toContain("VITE_CLERK_PUBLISHABLE_KEY");
    expect(missingPk?.action).toContain("Vercel");
    expect(missingPk?.action).toContain("pk_live_*");
    const missingIssuer = finding(
      missing,
      "config:missing:CLERK_JWT_ISSUER_DOMAIN",
    );
    expect(missingIssuer?.action).toContain("npx convex env set");
    const missingEncryptionKey = finding(
      missing,
      "config:missing:CONVEX_FIELD_ENCRYPTION_KEY",
    );
    expect(missingEncryptionKey?.action).toContain("npx convex env set");
    expect(missing.ok).toBe(false);

    // A development credential cannot silently qualify as production-ready
    // (issue #265: production shipped pk_test_*).
    const devCredential = checkDeploymentConfig(
      production({ viteClerkPublishableKey: PK_TEST, clerkSecretKey: SK_TEST }),
    );
    allFindings.push(...devCredential.findings);
    const devFinding = finding(
      devCredential,
      "clerk:dev_credential_in_production",
    );
    expect(devFinding?.severity).toBe("blocker");
    expect(devCredential.ok).toBe(false);
    expect(devFinding?.action).toContain("Rotate");
    expect(devFinding?.message).toContain("pk_test_*");

    // Redaction over everything above: no full credential value ever
    // appears in any finding text; only class markers do.
    const allText = JSON.stringify(allFindings);
    for (const secret of [PK_LIVE, PK_TEST, SK_LIVE, SK_TEST]) {
      expect(allText).not.toContain(secret);
    }
    expect(allText).toContain("pk_test_*");
    expect(allText).toContain("sk_test_*");
  });

  it("a consistent production snapshot with matching callbacks and audience stays clean", () => {
    const report = checkDeploymentConfig(
      production({
        siteUrl: PROD_ORIGIN,
        callbackUrls: ["https://preview.example.com", `${PROD_ORIGIN}/sign-in`],
        clerkJwtAudience: EXPECTED_CONVEX_AUDIENCE,
        expectedConvexDeployment: "impartial-mule-193",
        googleCalendarRedirectUri: `${PROD_ORIGIN}/admin/integrations`,
        clerkSecretKey: SK_LIVE,
        clerkPublishableKey: PK_LIVE,
        clerkFrontendApiUrl: PROD_ISSUER,
      }),
    );
    expect(codes(report)).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("development tolerates test credentials and localhost targets", () => {
    const report = checkDeploymentConfig({
      environment: "development",
      viteConvexUrl: "http://127.0.0.1:3210",
      viteClerkPublishableKey: PK_TEST,
      clerkJwtIssuerDomain: DEV_ISSUER,
      publicAppUrl: "http://localhost:7811",
    });
    expect(report.ok).toBe(true);
    expect(codes(report)).not.toContain("clerk:dev_credential_in_production");
    expect(codes(report)).not.toContain("convex:url_local_in_production");
  });

  it("template placeholder values are rejected instead of passing as real config", () => {
    const report = checkDeploymentConfig(
      production({
        viteClerkPublishableKey: "pk_test_xxxxxxxx",
        viteConvexUrl: "https://your-deployment.convex.cloud",
      }),
    );
    expect(codes(report)).toContain(
      "config:placeholder:VITE_CLERK_PUBLISHABLE_KEY",
    );
    expect(codes(report)).toContain("config:placeholder:VITE_CONVEX_URL");
    expect(report.ok).toBe(false);
  });

  it("unparseable values produce named blockers, and redactCredential never returns the value", () => {
    const report = checkDeploymentConfig(
      production({
        viteConvexUrl: "not-a-url",
        clerkJwtIssuerDomain: "not-a-url",
        publicAppUrl: "not-a-url",
      }),
    );
    expect(codes(report)).toContain("convex:url_unparseable");
    expect(codes(report)).toContain("clerk:issuer_unparseable");
    expect(codes(report)).toContain("env:public_app_url_unparseable");
    expect(report.ok).toBe(false);

    expect(EXPECTED_CONVEX_AUDIENCE).toBe("convex");
    expect(redactCredential("sk_live_whatever123")).toBe("sk_live_*");
    expect(redactCredential("pk_test_whatever123")).toBe("pk_test_*");
    expect(redactCredential("not-a-key")).toBe("<redacted>");
  });
});
