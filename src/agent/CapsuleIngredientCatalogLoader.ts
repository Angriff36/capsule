import { ConvexHttpClient } from "convex/browser";
import { api } from "../lib/api";
import type { CatalogIngredient } from "../features/kitchen/import/RecipeImportTypes";
import { CapsuleAgentAuthManager } from "./CapsuleAgentAuthManager";

interface IngredientRow {
  _id: string;
  name: string;
  unit?: string;
  deletedAt?: number | null;
}

/**
 * Loads the live Ingredient catalog for agent preview/match (same query as UI).
 * JWT remints on every load (Clerk session tokens expire in ~60s).
 */
export class CapsuleIngredientCatalogLoader {
  private client: ConvexHttpClient | null = null;

  constructor(
    private readonly auth: CapsuleAgentAuthManager = new CapsuleAgentAuthManager(),
  ) {}

  async load(): Promise<CatalogIngredient[]> {
    const client = await this.resolveClient();
    const rows = (await client.query(
      api.queries.listIngredient,
      {},
    )) as IngredientRow[];
    return (rows ?? []).map((row) => ({
      id: row._id,
      name: row.name,
      unit: row.unit,
      deletedAt: row.deletedAt ?? null,
    }));
  }

  private async resolveClient(): Promise<ConvexHttpClient> {
    if (!this.client) {
      this.client = new ConvexHttpClient(this.auth.resolveConvexUrl());
    }
    this.client.setAuth(await this.auth.resolveJwt());
    return this.client;
  }
}
