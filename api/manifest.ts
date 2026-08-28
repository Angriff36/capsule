// Vercel function: Capsule command API for remote agents holding a Clerk API
// key. Same paths and contract as the generated Convex dispatcher; see
// src/agent/CapsuleApiKeyGateway.ts. vercel.json rewrites
// /api/manifest/:path* here as ?p=:path* (a fixed entrypoint — no reliance
// on catch-all file routing). Needs CLERK_SECRET_KEY and CONVEX_SITE_URL (or
// VITE_CONVEX_URL) in the Vercel project env.
import {
  createApiKeyGateway,
  createClerkApiKeyGatewayDeps,
  restoreGatewayPath,
} from "../src/agent/CapsuleApiKeyGateway";

let gateway: ((request: Request) => Promise<Response>) | undefined;
const handle = (request: Request) =>
  (gateway ??= createApiKeyGateway(createClerkApiKeyGatewayDeps(process.env)))(
    restoreGatewayPath(request),
  );

export const GET = handle;
export const POST = handle;
