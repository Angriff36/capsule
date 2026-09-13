import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const RUN_ALERT_CONFIG_ENTITY = "RunAlertConfig";

export type RunAlertLoopOwner = {
  enabled: boolean;
  /** Id of the RunAlertsEnabled ledger row that owns the live scanner loop. */
  generation: string | null;
};

/**
 * AUTHOR SEAM — who owns the run-of-show scanner loop for a tenant.
 *
 * The loop is a self-rescheduling internalAction. Two concurrent enables, or
 * a disable/enable inside one scan interval, used to fork a second loop
 * (#298). Ownership is now the id of the latest RunAlertsEnabled ledger row:
 *   - claim() decides inside ONE mutation (serialized by Convex) whether a
 *     new loop may start, so two concurrent enables cannot both win;
 *   - every tick asserts it still carries the owning generation and retires
 *     silently otherwise, so orphans self-retire within one interval.
 * No schema change: the existing manifestEvents ledger already records the
 * config switches.
 */
export class RunAlertLoopLedger {
  async owner(ctx: QueryCtx, tenantId: string): Promise<RunAlertLoopOwner> {
    const latest = await this.latestConfig(ctx, tenantId);
    if (latest?.type !== "RunAlertsEnabled") {
      return { enabled: false, generation: null };
    }
    return { enabled: true, generation: String(latest._id) };
  }

  async enabled(ctx: QueryCtx, tenantId: string): Promise<boolean> {
    return (await this.owner(ctx, tenantId)).enabled;
  }

  /**
   * Records RunAlertsEnabled and returns the new generation, or null when a
   * loop already owns this tenant (the caller must not schedule another).
   */
  async claim(
    ctx: MutationCtx,
    tenantId: string,
    actorId: string | undefined,
  ): Promise<string | null> {
    const latest = await this.latestConfig(ctx, tenantId);
    if (latest?.type === "RunAlertsEnabled") return null;
    const id = await ctx.db.insert("manifestEvents", {
      type: "RunAlertsEnabled",
      entity: RUN_ALERT_CONFIG_ENTITY,
      entityId: tenantId,
      payload: { tenantId, actorId: actorId ?? null, ownsLoop: true },
      createdAt: Date.now(),
    });
    return String(id);
  }

  async disable(
    ctx: MutationCtx,
    tenantId: string,
    actorId: string | undefined,
  ): Promise<void> {
    await ctx.db.insert("manifestEvents", {
      type: "RunAlertsDisabled",
      entity: RUN_ALERT_CONFIG_ENTITY,
      entityId: tenantId,
      payload: { tenantId, actorId: actorId ?? null },
      createdAt: Date.now(),
    });
  }

  /**
   * May this tick keep scanning? A tick carrying a generation must still be
   * the owner. A legacy tick (scheduled before generations existed) keeps
   * running only while the owning enable row predates ownership tracking;
   * once someone re-enables through claim(), the legacy loop steps aside.
   */
  static mayScan(
    owner: RunAlertLoopOwner,
    latest: Doc<"manifestEvents"> | undefined,
    generation: string | undefined,
  ): boolean {
    if (!owner.enabled) return false;
    if (generation != null) return owner.generation === generation;
    const payload = latest?.payload as { ownsLoop?: unknown } | undefined;
    return payload?.ownsLoop !== true;
  }

  async latestConfig(
    ctx: QueryCtx,
    tenantId: string,
  ): Promise<Doc<"manifestEvents"> | undefined> {
    const rows = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", tenantId))
      .collect();
    return rows
      .filter(
        (row) =>
          row.entity === RUN_ALERT_CONFIG_ENTITY &&
          (row.type === "RunAlertsEnabled" ||
            row.type === "RunAlertsDisabled"),
      )
      .sort((left, right) => right.createdAt - left.createdAt)[0];
  }
}
