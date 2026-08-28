// AUTHOR-OWNED — not generated. Convex + Clerk auth configuration
// (docs.convex.dev/auth/clerk). Set CLERK_JWT_ISSUER_DOMAIN on the deployment:
//   npx convex env set CLERK_JWT_ISSUER_DOMAIN <issuer>
import type { AuthConfig } from "convex/server";

// Convex injects deployment env at runtime; fail closed if unset there.
const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN ?? "";

export default {
  providers: [
    // Employees: Clerk session JWT (the "convex" JWT template, aud "convex").
    {
      domain: issuer,
      applicationID: "convex",
    },
    // Machines: Clerk M2M JWTs (docs: clerk.com/docs/guides/development/
    // machine-auth/m2m-tokens, tokenFormat "jwt"). Same issuer and JWKS as
    // the session tokens, RS256, `sub` = machine id (mch_…), `aud` = [] — so
    // the aud-checked provider above rejects them and this one accepts them.
    // Tenant + role for a machine come only from a linked Person row
    // (convex/lib/authContext.ts), never from token claims.
    {
      type: "customJwt",
      issuer,
      jwks: `${issuer}/.well-known/jwks.json`,
      algorithm: "RS256",
    },
  ],
} satisfies AuthConfig;
