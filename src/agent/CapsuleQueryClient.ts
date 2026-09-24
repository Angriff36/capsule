import { ConvexHttpClient } from "convex/browser";
import type { WiringReadDescriptor } from "@angriff36/manifest/projections/wiring";
import {
  CAPSULE_ALLOWED_QUERIES,
  type CapsuleAllowedQueryName,
} from "./CapsuleAllowedQueries";
import { CapsuleAgentAuthManager } from "./CapsuleAgentAuthManager";
import { CapsuleGeneratedReadCatalog } from "./CapsuleGeneratedReadCatalog";

export type CapsuleReadAudience = "agent" | "client";

/**
 * Live read path for Capsule MCP: allowlisted Convex queries only.
 * Argument names and client visibility come from generated wiring.
 * JWT remints on every call (same auth manager as command executes).
 */
export class CapsuleQueryClient {
  private client: ConvexHttpClient | null = null;

  constructor(
    private readonly auth: CapsuleAgentAuthManager = new CapsuleAgentAuthManager(),
    private readonly reads: CapsuleGeneratedReadCatalog = new CapsuleGeneratedReadCatalog(),
  ) {}

  /** Generated contract for an allowlisted read, including detail reads. */
  contractFor(queryName: CapsuleAllowedQueryName): WiringReadDescriptor {
    this.assertAllowlisted(queryName);
    return this.reads.byExportName(queryName);
  }

  /**
   * Checks the generated read before a network call.
   * A client caller is refused when the contract says the read is not
   * client-callable. An agent may still run an allowlisted read.
   */
  prepare(
    queryName: CapsuleAllowedQueryName,
    args: Record<string, unknown> = {},
    audience: CapsuleReadAudience = "agent",
  ): { args: Record<string, unknown>; read: WiringReadDescriptor } {
    this.assertAllowlisted(queryName);
    if (audience === "client") {
      this.reads.assertClientMayCall(queryName);
    }
    return {
      read: this.reads.byExportName(queryName),
      args: this.reads.argumentsFor(queryName, args),
    };
  }

  async query(
    queryName: CapsuleAllowedQueryName,
    args: Record<string, unknown> = {},
    audience: CapsuleReadAudience = "agent",
  ): Promise<unknown> {
    const prepared = this.prepare(queryName, args, audience);
    const client = await this.resolveClient();
    return client.query(CAPSULE_ALLOWED_QUERIES[queryName].ref, prepared.args);
  }

  private assertAllowlisted(queryName: string): void {
    if (!(queryName in CAPSULE_ALLOWED_QUERIES)) {
      throw new Error(
        `Query '${queryName}' is not allowlisted for Capsule MCP.`,
      );
    }
  }

  private async resolveClient(): Promise<ConvexHttpClient> {
    if (!this.client) {
      this.client = new ConvexHttpClient(this.auth.resolveConvexUrl());
    }
    this.client.setAuth(await this.auth.resolveJwt());
    return this.client;
  }
}
