import { ConvexHttpClient } from "convex/browser";
import type { FunctionReference } from "convex/server";
import { api } from "../lib/api";
import type { CapsuleAgentAuthManager } from "./CapsuleAgentAuthManager";

/**
 * Re-runs a generated Convex query through the same HTTP client the
 * assistant already uses for reads. This is not a second cache.
 */
export class CapsuleConvexQueryRefetch {
  private client: ConvexHttpClient | null = null;

  constructor(private readonly auth: CapsuleAgentAuthManager) {}

  async refetch(
    exportName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const reference = (
      api.queries as Record<string, FunctionReference<"query"> | undefined>
    )[exportName];
    if (!reference) {
      throw new Error(`Convex has no query export '${exportName}'.`);
    }
    const client = await this.resolveClient();
    return client.query(reference, args);
  }

  private async resolveClient(): Promise<ConvexHttpClient> {
    if (!this.client) {
      this.client = new ConvexHttpClient(this.auth.resolveConvexUrl());
    }
    this.client.setAuth(await this.auth.resolveJwt());
    return this.client;
  }
}
