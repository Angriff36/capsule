import { CapsuleAgentJwtSession } from "./CapsuleAgentJwtSession";

/**
 * Resolves a Clerk JWT for Convex agent calls. Fail-closed: no anonymous fallback.
 *
 * Preferred: CAPSULE_AGENT_JWT (session JWT with role + tenantId claims for Convex).
 * Long-lived MCP hosts remint via CapsuleAgentJwtSession when the ~60s token expires.
 */
export class CapsuleAgentAuthManager {
  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly jwtSession: CapsuleAgentJwtSession = new CapsuleAgentJwtSession(
      env,
    ),
  ) {}

  /** Sync snapshot — prefer {@link resolveJwt} before live writes. */
  requireJwt(): string {
    const jwt =
      this.env.CAPSULE_AGENT_JWT?.trim() ||
      this.env.CLERK_CONVEX_JWT?.trim() ||
      "";
    if (!jwt) {
      throw new Error(
        "Missing CAPSULE_AGENT_JWT. Mint a Clerk session JWT for a workspace " +
          "member whose JWT template includes role + tenantId (same as the UI), " +
          "then set CAPSULE_AGENT_JWT in the environment " +
          "(or ensure CLERK_SECRET_KEY is set so MCP can remint).",
      );
    }
    return jwt;
  }

  async resolveJwt(): Promise<string> {
    return this.jwtSession.resolve();
  }

  resolveConvexUrl(): string {
    const url =
      this.env.CONVEX_URL?.trim() || this.env.VITE_CONVEX_URL?.trim() || "";
    if (!url) {
      throw new Error(
        "Missing CONVEX_URL (or VITE_CONVEX_URL) for Capsule agent command client.",
      );
    }
    return url;
  }
}
