// Vercel function: Capsule command API for remote agents holding a Clerk API
// key. Same paths and contract as the generated Convex dispatcher; see
// src/agent/CapsuleApiKeyGateway.ts. Needs CLERK_SECRET_KEY and
// CONVEX_SITE_URL (or VITE_CONVEX_URL) in the Vercel project env.
import {
  createApiKeyGateway,
  createClerkApiKeyGatewayDeps,
} from "../../src/agent/CapsuleApiKeyGateway";

let gateway: ((request: Request) => Promise<Response>) | undefined;
const handle = (request: Request) =>
  (gateway ??= createApiKeyGateway(createClerkApiKeyGatewayDeps(process.env)))(
    request,
  );

export const GET = handle;
export const POST = handle;
