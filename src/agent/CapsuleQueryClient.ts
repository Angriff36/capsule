import { ConvexHttpClient } from "convex/browser";
import {
  CAPSULE_ALLOWED_QUERIES,
  type CapsuleAllowedQueryName,
} from "./CapsuleAllowedQueries";
import { CapsuleAgentAuthManager } from "./CapsuleAgentAuthManager";

/**
 * Live read path for Capsule MCP: allowlisted Convex queries only.
 * JWT remints on every call (same auth manager as command executes).
 */
export class CapsuleQueryClient {
  private client: ConvexHttpClient | null = null;

  constructor(
    private readonly auth: CapsuleAgentAuthManager = new CapsuleAgentAuthManager(),
  ) {}

  async query(
    queryName: CapsuleAllowedQueryName,
    args: Record<string, unknown> = {},
  ): Promise<unknown> {
    const entry = CAPSULE_ALLOWED_QUERIES[queryName];
    if (!entry) {
      throw new Error(
        `Query '${queryName}' is not allowlisted for Capsule MCP.`,
      );
    }
    for (const key of entry.requiredArgs) {
      if (args[key] == null || args[key] === "") {
        throw new Error(`Query '${queryName}' requires arg '${key}'.`);
      }
    }
    const client = await this.resolveClient();
    return client.query(entry.ref, args);
  }

  private async resolveClient(): Promise<ConvexHttpClient> {
    if (!this.client) {
      this.client = new ConvexHttpClient(this.auth.resolveConvexUrl());
    }
    this.client.setAuth(await this.auth.resolveJwt());
    return this.client;
  }
}
