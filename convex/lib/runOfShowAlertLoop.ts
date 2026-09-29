import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { TenantSystemCommandRunner } from "./tenantSystemCommandRunner";

/** Entity name of the legacy hand-written switch rows in manifestEvents. */
export const RUN_ALERT_CONFIG_ENTITY = "RunAlertConfig";

export type RunAlertLoopOwner = {
  enabled: boolean;
  /** Token of the scanner loop that owns the tenant while enabled. */
  generation: string | null;
  /**
   * True while the tenant has no RunAlertSetting row and the legacy
   * manifestEvents switch rows still decide.
   */
  legacy: boolean;
  /** Legacy only: the owning enable row was claimed with a generation. */
  ownsLoop: boolean;
};

/**
 * AUTHOR SEAM — who owns the run-of-show scanner loop for a tenant.
 *
 * The loop is a self-rescheduling internalAction. Two concurrent enables, or
 * a disable/enable inside one scan interval, used to fork a second loop
 * (#298). Ownership is a generation token:
 *   - claim() decides inside ONE mutation (serialized by Convex) whether a
 *     new loop may start, so two concurrent enables cannot both win;
 *   - every tick asserts it still carries the owning generation and retires
 *     silently otherwise, so orphans self-retire within one interval.
 * ~~No schema change: the existing manifestEvents ledger already records the
 * config switches.~~
 * 2026-09-29: the switch is the RunAlertSetting entity
 * (src/operations/run-alert.manifest), changed only by its generated commands
 * (create, enable, disable) run as the tenant's system role, and the token is
 * `<settingId>:<version>` of the enable. A tenant with no RunAlertSetting row
 * yet is still read from the legacy manifestEvents rows (RunAlertsEnabled /
 * RunAlertsDisabled, entity RunAlertConfig, entityId = tenantId, token = the
 * enable row's id), so loops started by the old code keep running until the
 * first switch through the new path takes over.
 */
export class RunAlertLoopLedger {
  async setting(
    ctx: QueryCtx,
    tenantId: string,
  ): Promise<Doc<"runAlertSettings"> | null> {
    return await ctx.db
      .query("runAlertSettings")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .first();
  }

  async owner(ctx: QueryCtx, tenantId: string): Promise<RunAlertLoopOwner> {
    const setting = await this.setting(ctx, tenantId);
    if (setting) {
      return {
        enabled: setting.enabled,
        generation: setting.enabled ? (setting.generation ?? null) : null,
        legacy: false,
        ownsLoop: true,
      };
    }
    const latest = await this.latestConfig(ctx, tenantId);
    if (latest?.type !== "RunAlertsEnabled") {
      return { enabled: false, generation: null, legacy: true, ownsLoop: false };
    }
    const payload = latest.payload as { ownsLoop?: unknown } | undefined;
    return {
      enabled: true,
      generation: String(latest._id),
      legacy: true,
      ownsLoop: payload?.ownsLoop === true,
    };
  }

  async enabled(ctx: QueryCtx, tenantId: string): Promise<boolean> {
    return (await this.owner(ctx, tenantId)).enabled;
  }

  /**
   * Switches alerts on (RunAlertSetting.enable) and returns the new
   * generation, or null when a loop already owns this tenant (the caller must
   * not schedule another).
   */
  async claim(
    ctx: MutationCtx,
    tenantId: string,
    actorId: string | undefined,
  ): Promise<string | null> {
    if ((await this.owner(ctx, tenantId)).enabled) return null;
    const setting = await this.ensureSetting(ctx, tenantId);
    const generation = `${String(setting._id)}:${String(setting.version + 1)}`;
    await this.system(ctx, tenantId).runMutation(
      api.mutations.RunAlertSetting_enable,
      {
        docId: setting._id,
        version: setting.version,
        generation,
        ...(actorId ? { actorId } : {}),
      },
    );
    return generation;
  }

  /** Switches alerts off (RunAlertSetting.disable); a running loop retires. */
  async disable(
    ctx: MutationCtx,
    tenantId: string,
    actorId: string | undefined,
  ): Promise<void> {
    const setting = await this.ensureSetting(ctx, tenantId);
    await this.system(ctx, tenantId).runMutation(
      api.mutations.RunAlertSetting_disable,
      { docId: setting._id, ...(actorId ? { actorId } : {}) },
    );
  }

  /**
   * May this tick keep scanning? A tick carrying a generation must still be
   * the owner. A legacy tick (scheduled before generations existed) keeps
   * running only while the legacy owning enable row predates ownership
   * tracking; once someone switches alerts through claim()/disable(), the
   * legacy loop steps aside.
   */
  static mayScan(
    owner: RunAlertLoopOwner,
    generation: string | undefined,
  ): boolean {
    if (!owner.enabled) return false;
    if (generation != null) return owner.generation === generation;
    return owner.legacy && !owner.ownsLoop;
  }

  /** Latest legacy switch row (manifestEvents), for tenants not yet migrated. */
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

  private system(ctx: MutationCtx, tenantId: string) {
    return TenantSystemCommandRunner.forTenant(ctx, tenantId).context;
  }

  /** The tenant's switch row, created (off) through RunAlertSetting.create. */
  private async ensureSetting(
    ctx: MutationCtx,
    tenantId: string,
  ): Promise<Doc<"runAlertSettings">> {
    const existing = await this.setting(ctx, tenantId);
    if (existing) return existing;
    const now = Date.now();
    const created = (await this.system(ctx, tenantId).runMutation(
      api.mutations.RunAlertSetting_create,
      { createdAt: now, updatedAt: now },
    )) as { _id?: Id<"runAlertSettings"> } | null;
    const row = created?._id ? await ctx.db.get(created._id) : null;
    if (!row) throw new Error("Background alerts could not be switched.");
    return row;
  }
}
