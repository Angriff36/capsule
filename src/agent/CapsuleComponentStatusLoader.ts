import { ConvexHttpClient } from "convex/browser";
import { api } from "../lib/api";
import { CapsuleAgentAuthManager } from "./CapsuleAgentAuthManager";

export type CapsuleComponentLifecycleStatus =
  "draft" | "published" | "retired" | "missing";

/** Port for document-enter component lifecycle checks (HTTP or harness-backed). */
export interface CapsuleComponentStatusReader {
  loadStatus(componentId: string): Promise<CapsuleComponentLifecycleStatus>;
}

/**
 * Reads Component.status for document-enter idempotency recovery.
 * Document-hash keys must not reuse retired components after a wipe.
 * Live Convex HTTP path — proofs must inject a harness-backed reader instead.
 */
export class CapsuleComponentStatusLoader implements CapsuleComponentStatusReader {
  private client: ConvexHttpClient | null = null;

  constructor(
    private readonly auth: CapsuleAgentAuthManager = new CapsuleAgentAuthManager(),
  ) {}

  async loadStatus(
    componentId: string,
  ): Promise<CapsuleComponentLifecycleStatus> {
    const client = await this.resolveClient();
    const rows = (await client.query(api.queries.listComponent, {})) as Array<{
      _id: string;
      status?: string;
      deletedAt?: number | null;
    }>;
    const row = rows.find((r) => r._id === componentId);
    if (!row || row.deletedAt != null) {
      return "missing";
    }
    if (
      row.status === "draft" ||
      row.status === "published" ||
      row.status === "retired"
    ) {
      return row.status;
    }
    return "missing";
  }

  private async resolveClient(): Promise<ConvexHttpClient> {
    if (!this.client) {
      this.client = new ConvexHttpClient(this.auth.resolveConvexUrl());
    }
    this.client.setAuth(await this.auth.resolveJwt());
    return this.client;
  }
}
