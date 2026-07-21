import { ConvexHttpClient } from "convex/browser";
import { api } from "../lib/api";
import { CapsuleAgentAuthManager } from "./CapsuleAgentAuthManager";

export type CapsuleRecipeLifecycleStatus =
  "draft" | "published" | "retired" | "missing";

/**
 * Reads Recipe.status for document-enter idempotency recovery.
 * Document-hash keys must not reuse retired recipes after a wipe.
 */
export class CapsuleRecipeStatusLoader {
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
