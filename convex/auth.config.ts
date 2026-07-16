// AUTHOR-OWNED — not generated. Convex + Clerk auth configuration
// (docs.convex.dev/auth/clerk). Set CLERK_JWT_ISSUER_DOMAIN on the deployment:
//   npx convex env set CLERK_JWT_ISSUER_DOMAIN <issuer>
import type { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
