import { ConvexHttpClient } from "convex/browser";
import { api } from "../lib/api";
import { CapsuleAgentAuthManager } from "./CapsuleAgentAuthManager";

export type CapsuleRecipeLifecycleStatus =
  "draft" | "published" | "retired" | "missing";

/** Port for document-enter recipe lifecycle checks (HTTP or harness-backed). */
export interface CapsuleRecipeStatusReader {
  loadStatus(recipeId: string): Promise<CapsuleRecipeLifecycleStatus>;
}

/**
 * Reads Recipe.status for document-enter idempotency recovery.
 * Document-hash keys must not reuse retired recipes after a wipe.
 * Live Convex HTTP path — proofs must inject a harness-backed reader instead.
 */
export class CapsuleRecipeStatusLoader implements CapsuleRecipeStatusReader {
  private client: ConvexHttpClient | null = null;

  constructor(
    private readonly auth: CapsuleAgentAuthManager = new CapsuleAgentAuthManager(),
  ) {}

  async loadStatus(recipeId: string): Promise<CapsuleRecipeLifecycleStatus> {
    const client = await this.resolveClient();
    const rows = (await client.query(api.queries.listRecipe, {})) as Array<{
      _id: string;
      status?: string;
      deletedAt?: number | null;
    }>;
    const row = rows.find((r) => r._id === recipeId);
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
