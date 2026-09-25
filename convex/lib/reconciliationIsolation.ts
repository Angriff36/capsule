/**
 * AC-424 failure isolation for Event reconciliation domains: one domain's
 * throw must not abort the remaining domains, and a partial run must never
 * report the parent fully reconciled. Each domain failure persists its own
 * exception receipt (family `eventReconciliation`); after every domain one
 * parent receipt records the whole outcome. No second receipt table — both
 * ride the shared materializationReceipt storage.
 */
import type { MutationCtx } from "../_generated/server";
import { eventReconciliationReceipt } from "./reconciliationReceipt";

export type IsolationDomain = {
  name: string;
  run: () => Promise<void>;
  /** A throw aborts the whole command instead of being recorded: this
   * domain's work must never be left half-done under a committed parent. */
  mustSucceed?: boolean;
};

type IsolationTrigger = {
  triggerEventId: string;
  triggerType: string;
};

type IsolationArgs = {
  eventId: string;
  tenantId: string;
  trigger: IsolationTrigger;
  domains: IsolationDomain[];
};

export class EventReconciliationIsolation {
  /** `${eventId}:parent:${triggerType}` — triggerType carries no colon. */
  parentOperationKey(eventId: string, triggerType: string): string {
    return `${eventId}:parent:${triggerType}`;
  }

  /** `${eventId}:${domain}:exception:${triggerEventId}` */
  exceptionOperationKey(
    eventId: string,
    domain: string,
    triggerEventId: string,
  ): string {
    return `${eventId}:${domain}:exception:${triggerEventId}`;
  }

  /** Runs every domain in order; a throw is caught, recorded, and the walk
   * continues. Exactly one parent receipt is written afterwards. */
  async run(ctx: MutationCtx, args: IsolationArgs): Promise<void> {
    const unresolved: { code: string; recordIds: string[] }[] = [];
    for (const domain of args.domains) {
      try {
        await domain.run();
      } catch (error) {
        if (domain.mustSucceed) throw error;
        const code = error instanceof Error ? error.message : String(error);
        const entry = { code, recordIds: [args.eventId] };
        unresolved.push(entry);
        await this.persistException(ctx, args, domain.name, entry);
      }
    }
    await this.persistParent(ctx, args, unresolved);
  }

  private async persistException(
    ctx: MutationCtx,
    args: IsolationArgs,
    domain: string,
    entry: { code: string; recordIds: string[] },
  ): Promise<void> {
    const operationKey = this.exceptionOperationKey(
      args.eventId,
      domain,
      args.trigger.triggerEventId,
    );
    await eventReconciliationReceipt.persist(ctx, args.tenantId, operationKey, {
      eventId: args.eventId,
      tenantId: args.tenantId,
      triggerEventId: args.trigger.triggerEventId,
      triggerType: args.trigger.triggerType,
      inputVersions: { checkpoint: "exception", windows: [] },
      affectedDomains: [domain],
      createdCount: 0,
      updatedCount: 0,
      retiredCount: 0,
      preservedCount: 0,
      exceptionCount: 1,
      unresolved: [entry],
      checkpoint: { state: "partial", key: operationKey },
      fullyReconciled: false,
    });
  }

  private async persistParent(
    ctx: MutationCtx,
    args: IsolationArgs,
    unresolved: { code: string; recordIds: string[] }[],
  ): Promise<void> {
    const operationKey = this.parentOperationKey(
      args.eventId,
      args.trigger.triggerType,
    );
    await eventReconciliationReceipt.persist(ctx, args.tenantId, operationKey, {
      eventId: args.eventId,
      tenantId: args.tenantId,
      triggerEventId: args.trigger.triggerEventId,
      triggerType: args.trigger.triggerType,
      inputVersions: { checkpoint: "parent", windows: [] },
      affectedDomains: args.domains.map((domain) => domain.name),
      createdCount: 0,
      updatedCount: 0,
      retiredCount: 0,
      preservedCount: 0,
      exceptionCount: unresolved.length,
      unresolved,
      checkpoint: {
        state: unresolved.length > 0 ? "partial" : "complete",
        key: operationKey,
      },
      fullyReconciled: unresolved.length === 0,
    });
  }
}

export const eventReconciliationIsolation = new EventReconciliationIsolation();
