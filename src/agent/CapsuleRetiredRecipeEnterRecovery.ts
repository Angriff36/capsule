import type { CapsuleCommandExecutor } from "./CapsuleCommandExecutor";
import type { CapsuleRecipeStatusReader } from "./CapsuleRecipeStatusLoader";

/**
 * Document-hash `Recipe.draft` can return a retired row after a kitchen wipe.
 * Prefer reinstate (same catalog id) over minting aliveN duplicate recipes.
 */
export class CapsuleRetiredRecipeEnterRecovery {
  constructor(
    private readonly executor: CapsuleCommandExecutor,
    private readonly statusLoader: CapsuleRecipeStatusReader,
  ) {}

  /**
   * Returns a draft/published recipe id, or null when the row is missing/unusable.
   */
  async ensureWritableRecipe(docId: string): Promise<string | null> {
    const status = await this.statusLoader.loadStatus(docId);
    if (status === "draft" || status === "published") {
      return docId;
    }
    if (status !== "retired") {
      return null;
    }

    try {
      await this.executor.execute({
        capabilityId: "Recipe.reinstate",
        args: { docId },
        idempotencyKey: `enter-recovery:Recipe.reinstate:${docId}`,
      });
    } catch {
      return null;
    }

    const after = await this.statusLoader.loadStatus(docId);
    if (after === "draft" || after === "published") {
      return docId;
    }
    return null;
  }
}
