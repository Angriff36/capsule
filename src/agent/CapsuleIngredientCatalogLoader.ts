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
 */
export class CapsuleIngredientCatalogLoader {
  private readonly client: ConvexHttpClient;

  constructor(auth: CapsuleAgentAuthManager = new CapsuleAgentAuthManager()) {
    this.client = new ConvexHttpClient(auth.resolveConvexUrl());
    this.client.setAuth(auth.requireJwt());
  }

  async load(): Promise<CatalogIngredient[]> {
    const rows = (await this.client.query(
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
}
