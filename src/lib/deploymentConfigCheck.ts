// PR12-01 / AC-028: production deployment/startup config checks.
//
// Pure module — no I/O, no environment access. Callers feed it a snapshot:
//   - scripts/check-deployment-config.ts (CLI over process.env + env files)
//   - scripts/vercel-build.sh (production gate inside the Vercel build)
//   - scripts/release.sh (pre-flight; shell env only)
//
// Variable names follow the .env.example / convex/auth.config.ts contract:
//   VITE_CONVEX_URL, VITE_CLERK_PUBLISHABLE_KEY (frontend, baked at build)
//   CLERK_JWT_ISSUER_DOMAIN, CAPSULE_PUBLIC_APP_URL (Convex deployment env)
//   CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, CLERK_FRONTEND_API_URL
//   (local CLI / API-key gateway helpers)
//   GOOGLE_CALENDAR_REDIRECT_URI (calendar sync worker callback)
//
// Messages never contain credential values. They carry variable names, key
// classes (pk_test_*), and URL origins only — see redactCredential().

/** Convex rejects Clerk JWTs whose aud differs from the auth.config
 *  applicationID (convex/auth.config.ts pins "convex"). */
export const EXPECTED_CONVEX_AUDIENCE = "convex";

export type DeploymentConfigFindingSeverity = "blocker" | "warning";

export interface DeploymentConfigFinding {
  code: string;
  severity: DeploymentConfigFindingSeverity;
  message: string;
  /** The concrete fix: which surface to set, or which key to rotate. */
  action: string;
}

export interface DeploymentConfigInput {
  /** "production" | "development" | "preview" (VERCEL_ENV ?? NODE_ENV). */
  environment: string;
  /** VITE_CONVEX_URL — the backend the shipped frontend talks to. */
  viteConvexUrl?: string | null;
  /** VITE_CLERK_PUBLISHABLE_KEY — Clerk frontend key, baked at build. */
  viteClerkPublishableKey?: string | null;
  /** CLERK_JWT_ISSUER_DOMAIN — Convex auth.config domain (Convex env). */
  clerkJwtIssuerDomain?: string | null;
  /** CAPSULE_PUBLIC_APP_URL — public origin for Stripe links + hire emails. */
  publicAppUrl?: string | null;
  /** GOOGLE_CALENDAR_REDIRECT_URI — OAuth callback of the calendar worker. */
  googleCalendarRedirectUri?: string | null;
  /** CLERK_PUBLISHABLE_KEY — API-key gateway helper (same instance as VITE). */
  clerkPublishableKey?: string | null;
  /** CLERK_SECRET_KEY — server-side Clerk key; never shipped to browsers. */
  clerkSecretKey?: string | null;
  /** CLERK_FRONTEND_API_URL — helper naming the same Clerk instance. */
  clerkFrontendApiUrl?: string | null;
  /** CONVEX_FIELD_ENCRYPTION_KEY — required on the deployment the UI hits. */
  convexFieldEncryptionKey?: string | null;
  /** Convex deployment name this release targets; checked against the
   *  VITE_CONVEX_URL host label (owner deployment map supplies the name). */
  expectedConvexDeployment?: string | null;
  /** Canonical production site origin (release context / Vercel domain). */
  siteUrl?: string | null;
  /** Clerk allowed origins / redirect URLs, when the caller can supply them
   *  (dashboard or API). Absent means "not verifiable from this context". */
  callbackUrls?: readonly string[] | null;
  /** The aud claim the Clerk JWT template emits, when known. Absent means
   *  "not verifiable from this context". */
  clerkJwtAudience?: string | null;
  /** Variable names that must be present in this context; each missing one
   *  becomes a redacted, actionable missing-config blocker. */
  requiredVars?: readonly string[] | null;
}

export interface DeploymentConfigReport {
  environment: string;
  /** True when no finding has severity "blocker". */
  ok: boolean;
  findings: DeploymentConfigFinding[];
}

/** Redact a credential to its class marker. Never returns the value. */
export function redactCredential(value: string): string {
  if (/^pk_live_[A-Za-z0-9_-]*$/.test(value)) return "pk_live_*";
  if (/^pk_test_[A-Za-z0-9_-]*$/.test(value)) return "pk_test_*";
  if (/^sk_live_[A-Za-z0-9_-]*$/.test(value)) return "sk_live_*";
  if (/^sk_test_[A-Za-z0-9_-]*$/.test(value)) return "sk_test_*";
  return "<redacted>";
}

function credentialClass(value: string): string | null {
  const redacted = redactCredential(value);
  return redacted === "<redacted>" ? null : redacted.slice(0, -2);
}

const MISSING_CONFIG_ACTIONS: Record<string, string> = {
  VITE_CONVEX_URL:
    "Set VITE_CONVEX_URL in the Vercel project environment (Settings → Environment Variables). Frontend env is baked at build time, so a redeploy is required.",
  VITE_CLERK_PUBLISHABLE_KEY:
    "Set VITE_CLERK_PUBLISHABLE_KEY in the Vercel project environment to a pk_live_* key from the production Clerk instance.",
  CLERK_JWT_ISSUER_DOMAIN:
    "Run: npx convex env set CLERK_JWT_ISSUER_DOMAIN <issuer> --prod (Clerk Dashboard → API keys → JWT issuer). While unset, convex/auth.config.ts fails closed and Convex rejects every JWT.",
  CAPSULE_PUBLIC_APP_URL:
    "Run: npx convex env set CAPSULE_PUBLIC_APP_URL <https://production-origin> --prod — Stripe return links and hire sign-in emails use it.",
  CONVEX_FIELD_ENCRYPTION_KEY:
    "Run: npx convex env set CONVEX_FIELD_ENCRYPTION_KEY <32-byte secret> --prod — it must exist on the deployment the UI hits.",
  CLERK_SECRET_KEY:
    "Set CLERK_SECRET_KEY in the server environment of the API-key gateway (never a VITE_ variable; it must not reach the browser).",
  CLERK_PUBLISHABLE_KEY:
    "Set CLERK_PUBLISHABLE_KEY to the same publishable key as VITE_CLERK_PUBLISHABLE_KEY.",
};

const VAR_VALUES: Record<
  string,
  (input: DeploymentConfigInput) => string | null | undefined
> = {
  VITE_CONVEX_URL: (i) => i.viteConvexUrl,
  VITE_CLERK_PUBLISHABLE_KEY: (i) => i.viteClerkPublishableKey,
  CLERK_JWT_ISSUER_DOMAIN: (i) => i.clerkJwtIssuerDomain,
  CAPSULE_PUBLIC_APP_URL: (i) => i.publicAppUrl,
  CONVEX_FIELD_ENCRYPTION_KEY: (i) => i.convexFieldEncryptionKey,
  CLERK_SECRET_KEY: (i) => i.clerkSecretKey,
  CLERK_PUBLISHABLE_KEY: (i) => i.clerkPublishableKey,
};

const PLACEHOLDER_MARKERS = ["xxxx", "your-app", "your-deployment", "changeme"];

function present(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function trimmed(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker));
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

function isLocalhostHost(host: string): boolean {
  return (
    host === "localhost" ||
    host.startsWith("127.") ||
    host === "[::1]" ||
    host === "0.0.0.0"
  );
}

function isClerkDevDomain(host: string): boolean {
  return host.endsWith(".clerk.accounts.dev");
}

function firstHostLabel(url: URL): string {
  return url.hostname.toLowerCase().split(".")[0] ?? url.hostname.toLowerCase();
}

function originOrNull(value: string | null | undefined): string | null {
  if (!present(value)) return null;
  const url = parseUrl(value);
  return url ? url.origin : null;
}

/**
 * Check a deployment config snapshot. Every finding names the exact surface
 * to fix and never includes a credential value.
 */
export function checkDeploymentConfig(
  input: DeploymentConfigInput,
): DeploymentConfigReport {
  const findings: DeploymentConfigFinding[] = [];
  const blocker = (code: string, message: string, action: string): void => {
    findings.push({ code, severity: "blocker", message, action });
  };
  const prod = input.environment === "production";

  // --- Missing required configuration (redacted + actionable) -------------
  for (const name of input.requiredVars ?? []) {
    const lookup = VAR_VALUES[name];
    if (lookup && !present(lookup(input))) {
      blocker(
        `config:missing:${name}`,
        `${name} is not set in this context.`,
        MISSING_CONFIG_ACTIONS[name] ??
          `Set ${name} on the surface that owns it (see .env.example).`,
      );
    }
  }

  // --- Placeholder template values ----------------------------------------
  const placeholderVars: Array<[string, string | null | undefined]> = [
    ["VITE_CLERK_PUBLISHABLE_KEY", input.viteClerkPublishableKey],
    ["CLERK_JWT_ISSUER_DOMAIN", input.clerkJwtIssuerDomain],
    ["VITE_CONVEX_URL", input.viteConvexUrl],
    ["CAPSULE_PUBLIC_APP_URL", input.publicAppUrl],
  ];
  for (const [name, value] of placeholderVars) {
    if (present(value) && isPlaceholder(value)) {
      blocker(
        `config:placeholder:${name}`,
        `${name} still holds a template placeholder value.`,
        MISSING_CONFIG_ACTIONS[name] ??
          `Set ${name} to the real value for this environment.`,
      );
    }
  }

  // --- Clerk application keys ---------------------------------------------
  const pkValue = trimmed(input.viteClerkPublishableKey);
  const pkClass = pkValue ? credentialClass(pkValue) : null;
  if (pkValue && !pkClass) {
    blocker(
      "clerk:publishable_key_unrecognized",
      "VITE_CLERK_PUBLISHABLE_KEY does not look like a Clerk key (expected pk_live_* or pk_test_*).",
      "Copy the publishable key from Clerk Dashboard → API keys into the Vercel project environment.",
    );
  }
  const skValue = trimmed(input.clerkSecretKey);
  const skClass = skValue ? credentialClass(skValue) : null;
  if (skValue && !skClass) {
    blocker(
      "clerk:secret_key_unrecognized",
      "CLERK_SECRET_KEY does not look like a Clerk secret key (expected sk_live_* or sk_test_*).",
      "Copy the secret key from Clerk Dashboard → API keys into the server environment that uses it.",
    );
  }
  if (pkClass && skClass && pkClass.split("_")[1] !== skClass.split("_")[1]) {
    blocker(
      "clerk:keypair_environment_mismatch",
      `CLERK_SECRET_KEY is ${skClass}_* while VITE_CLERK_PUBLISHABLE_KEY is ${pkClass}_*; the pair comes from different Clerk environments and cannot work together.`,
      "Take both keys from the same Clerk instance and environment (Dashboard → API keys) and set them on their owning surfaces again.",
    );
  }
  const gatewayPk = trimmed(input.clerkPublishableKey);
  if (gatewayPk && pkValue && gatewayPk !== pkValue) {
    blocker(
      "clerk:publishable_key_divergence",
      `CLERK_PUBLISHABLE_KEY (${redactCredential(gatewayPk)}) does not match VITE_CLERK_PUBLISHABLE_KEY (${redactCredential(pkValue)}); the API-key gateway and the frontend would target different Clerk applications.`,
      "Set CLERK_PUBLISHABLE_KEY to the same publishable key as VITE_CLERK_PUBLISHABLE_KEY.",
    );
  }

  // --- Clerk issuer --------------------------------------------------------
  const issuerUrl = present(input.clerkJwtIssuerDomain)
    ? parseUrl(input.clerkJwtIssuerDomain)
    : null;
  if (present(input.clerkJwtIssuerDomain) && !issuerUrl) {
    blocker(
      "clerk:issuer_unparseable",
      "CLERK_JWT_ISSUER_DOMAIN is not a parseable URL.",
      "Set the full issuer origin, e.g. https://clerk.yourdomain.com (Clerk Dashboard → API keys → JWT issuer), then: npx convex env set CLERK_JWT_ISSUER_DOMAIN <issuer> --prod.",
    );
  }
  if (issuerUrl) {
    const issuerHost = issuerUrl.hostname.toLowerCase();
    const frontendApiUrl = present(input.clerkFrontendApiUrl)
      ? parseUrl(input.clerkFrontendApiUrl)
      : null;
    if (
      frontendApiUrl &&
      frontendApiUrl.hostname.toLowerCase() !== issuerHost
    ) {
      blocker(
        "clerk:issuer_frontend_api_mismatch",
        `CLERK_JWT_ISSUER_DOMAIN host (${issuerHost}) does not match CLERK_FRONTEND_API_URL host (${frontendApiUrl.hostname.toLowerCase()}); both must name the same Clerk instance.`,
        "Copy the same instance origin into CLERK_JWT_ISSUER_DOMAIN (Convex env) and CLERK_FRONTEND_API_URL.",
      );
    }
    const issuerIsDev = isClerkDevDomain(issuerHost);
    if (pkClass === "pk_live" && issuerIsDev) {
      blocker(
        "clerk:issuer_key_environment_mismatch",
        "CLERK_JWT_ISSUER_DOMAIN is a development domain (*.clerk.accounts.dev) while VITE_CLERK_PUBLISHABLE_KEY is pk_live_*; live keys issue tokens from the production domain, so Convex would reject them.",
        "Point CLERK_JWT_ISSUER_DOMAIN at the production Clerk domain: npx convex env set CLERK_JWT_ISSUER_DOMAIN <https://production-domain> --prod.",
      );
    }
    if (pkClass === "pk_test" && !issuerIsDev) {
      blocker(
        "clerk:issuer_key_environment_mismatch",
        "CLERK_JWT_ISSUER_DOMAIN is a production domain while VITE_CLERK_PUBLISHABLE_KEY is pk_test_*; test keys issue tokens from the development domain, so Convex would reject them.",
        "Use one environment on both sides: either live keys with the production issuer, or test keys with the *.clerk.accounts.dev issuer.",
      );
    }
  }

  // --- Convex audience -----------------------------------------------------
  const audience = trimmed(input.clerkJwtAudience);
  if (audience && audience !== EXPECTED_CONVEX_AUDIENCE) {
    blocker(
      "convex:audience_mismatch",
      `The Clerk JWT template audience ("${audience}") does not match the Convex applicationID ("${EXPECTED_CONVEX_AUDIENCE}" in convex/auth.config.ts); Convex rejects those tokens at the door.`,
      `Set the JWT template aud claim to "${EXPECTED_CONVEX_AUDIENCE}" in Clerk Dashboard → JWT Templates.`,
    );
  }

  // --- Convex URL ------------------------------------------------------------
  const convexUrl = present(input.viteConvexUrl)
    ? parseUrl(input.viteConvexUrl)
    : null;
  if (present(input.viteConvexUrl) && !convexUrl) {
    blocker(
      "convex:url_unparseable",
      "VITE_CONVEX_URL is not a parseable URL.",
      MISSING_CONFIG_ACTIONS.VITE_CONVEX_URL,
    );
  }
  if (convexUrl) {
    const host = convexUrl.hostname.toLowerCase();
    if (prod && isLocalhostHost(host)) {
      blocker(
        "convex:url_local_in_production",
        `VITE_CONVEX_URL points at ${convexUrl.origin} (localhost) while the environment is production.`,
        "Set VITE_CONVEX_URL in the Vercel project environment to the production deployment URL.",
      );
    }
    const expected = trimmed(input.expectedConvexDeployment).toLowerCase();
    if (expected && firstHostLabel(convexUrl) !== expected) {
      blocker(
        "convex:url_deployment_mismatch",
        `VITE_CONVEX_URL points at ${convexUrl.origin} but this release targets Convex deployment "${expected}".`,
        `Set VITE_CONVEX_URL in the Vercel project environment to the ${expected} deployment URL.`,
      );
    }
  }

  // --- Public app origin / OAuth callback ---------------------------------
  const publicAppUrl = present(input.publicAppUrl)
    ? parseUrl(input.publicAppUrl)
    : null;
  if (present(input.publicAppUrl) && !publicAppUrl) {
    blocker(
      "env:public_app_url_unparseable",
      "CAPSULE_PUBLIC_APP_URL is not a parseable URL.",
      MISSING_CONFIG_ACTIONS.CAPSULE_PUBLIC_APP_URL,
    );
  }
  const publicAppOrigin = publicAppUrl ? publicAppUrl.origin : null;
  if (
    publicAppUrl &&
    prod &&
    isLocalhostHost(publicAppUrl.hostname.toLowerCase())
  ) {
    blocker(
      "env:public_app_url_local_in_production",
      `CAPSULE_PUBLIC_APP_URL is ${publicAppOrigin} (localhost) while the environment is production; Stripe return links and hire sign-in emails would point at localhost.`,
      MISSING_CONFIG_ACTIONS.CAPSULE_PUBLIC_APP_URL,
    );
  }
  const siteOrigin = originOrNull(input.siteUrl);
  if (present(input.siteUrl) && !siteOrigin) {
    blocker(
      "env:site_url_unparseable",
      "The supplied --site-url is not a parseable URL.",
      "Pass the canonical production origin, e.g. --site-url https://capsule.example.com.",
    );
  }
  if (prod && publicAppOrigin && siteOrigin && publicAppOrigin !== siteOrigin) {
    blocker(
      "env:public_app_url_mismatch",
      `CAPSULE_PUBLIC_APP_URL origin (${publicAppOrigin}) does not match the production site origin (${siteOrigin}).`,
      `Run: npx convex env set CAPSULE_PUBLIC_APP_URL ${siteOrigin} --prod.`,
    );
  }
  const redirectOrigin = originOrNull(input.googleCalendarRedirectUri);
  if (present(input.googleCalendarRedirectUri) && !redirectOrigin) {
    blocker(
      "env:redirect_uri_unparseable",
      "GOOGLE_CALENDAR_REDIRECT_URI is not a parseable URL.",
      "Set the full redirect URI (origin + path) that is authorized in Google Cloud Console.",
    );
  }
  if (redirectOrigin && publicAppOrigin && redirectOrigin !== publicAppOrigin) {
    blocker(
      "env:redirect_origin_mismatch",
      `GOOGLE_CALENDAR_REDIRECT_URI origin (${redirectOrigin}) does not match CAPSULE_PUBLIC_APP_URL origin (${publicAppOrigin}); the OAuth callback would land on a different origin than the app publishes.`,
      "Point both at the same origin, and authorize that exact redirect URI in Google Cloud Console.",
    );
  }

  // --- Clerk callback / allowed origins ------------------------------------
  if (input.callbackUrls && siteOrigin) {
    const callbackOrigins = input.callbackUrls
      .map((entry) => originOrNull(entry))
      .filter((origin): origin is string => origin !== null);
    if (!callbackOrigins.includes(siteOrigin)) {
      blocker(
        "clerk:callback_url_mismatch",
        `None of the ${input.callbackUrls.length} Clerk allowed/redirect origins matches the production site origin ${siteOrigin}; sign-in loops back to nothing.`,
        `Add ${siteOrigin} in Clerk Dashboard → Configure → Allowed origins & redirect URLs.`,
      );
    }
  }

  // --- Development credentials in production (issue #265) ------------------
  const devCredentials: string[] = [];
  if (pkClass === "pk_test") {
    devCredentials.push("VITE_CLERK_PUBLISHABLE_KEY is pk_test_*");
  }
  if (skClass === "sk_test") {
    devCredentials.push("CLERK_SECRET_KEY is sk_test_*");
  }
  if (issuerUrl && isClerkDevDomain(issuerUrl.hostname.toLowerCase())) {
    devCredentials.push(
      "CLERK_JWT_ISSUER_DOMAIN is a *.clerk.accounts.dev development domain",
    );
  }
  if (prod && devCredentials.length > 0) {
    blocker(
      "clerk:dev_credential_in_production",
      `Development Clerk credentials while the environment is production: ${devCredentials.join("; ")}. Development instances have strict usage limits and are not production-ready (issue #265).`,
      "Rotate on the production Clerk instance: set VITE_CLERK_PUBLISHABLE_KEY (pk_live_*) in the Vercel project env, set CLERK_SECRET_KEY (sk_live_*) where the gateway runs, set CLERK_JWT_ISSUER_DOMAIN via npx convex env set --prod, add the production domains to Clerk allowed origins, then release again.",
    );
  }

  return {
    environment: input.environment,
    ok: !findings.some((finding) => finding.severity === "blocker"),
    findings,
  };
}
