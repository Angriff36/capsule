// AUTHOR-OWNED — not generated. Convex + Clerk auth configuration
// (docs.convex.dev/auth/clerk). Set on the deployment:
//   npx convex env set CLERK_JWT_ISSUER_DOMAIN <issuer>
//   npx convex env set CLERK_M2M_AUDIENCE <receiver machine id, mch_…>
import type { AuthConfig } from "convex/server";

// Convex injects deployment env at runtime; fail closed if unset there.
const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN ?? "";
// The Clerk machine that REPRESENTS this API. Agent machines are scoped to
// it, so their M2M JWTs carry `aud: [<this id>]` (Clerk fills aud from the
// machine scope). Unset → no machine provider at all.
const m2mAudience = process.env.CLERK_M2M_AUDIENCE ?? "";

export default {
  providers: [
    // Employees: Clerk session JWT (the "convex" JWT template, aud "convex").
    {
      domain: issuer,
      applicationID: "convex",
    },
    // Machines: Clerk M2M JWTs (docs: clerk.com/docs/guides/development/
    // machine-auth/m2m-tokens, tokenFormat "jwt"). Same issuer and JWKS as
    // the session tokens, RS256, `sub` = agent machine id (mch_…), `aud` =
    // the receiver machine id. Convex matches iss + aud, so employee tokens
    // (aud "convex") never hit this provider and machine tokens never hit
    // the one above. Tenant + role for a machine come only from a linked
    // Person row (convex/lib/authContext.ts), never from token claims.
    ...(m2mAudience
      ? [
          {
            type: "customJwt" as const,
            applicationID: m2mAudience,
            issuer,
            jwks: `${issuer}/.well-known/jwks.json`,
            algorithm: "RS256" as const,
          },
        ]
      : []),
  ],
} satisfies AuthConfig;
