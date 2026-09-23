/**
 * §8.2 reconciliation receipts (AC-423): the persisted proof that an
 * Event-change reconciliation ran against a specific input shape, so a retry
 * can prove it was a no-op and an operator can read counts and unresolved
 * codes. Stored through the shared materializationReceipt table — no
 * parallel receipt system.
 */
import type { MutationCtx } from "../_generated/server";
import {
  readMaterializationReceipt,
  writeMaterializationReceipt,
} from "./materializationReceipt";

export type TimingWindow = {
  key: string;
  startsAt: number | null;
  endsAt: number | null;
};

export type ReconciliationReceiptOutput = {
  eventId: string;
  tenantId: string;
  triggerEventId: string;
  triggerType: string;
  inputVersions: {
    checkpoint: string;
    windows: TimingWindow[];
  };
  affectedDomains: string[];
  createdCount: number;
  updatedCount: number;
  retiredCount: number;
  preservedCount: number;
  exceptionCount: number;
  unresolved: { code: string; recordIds: string[] }[];
  checkpoint: { state: "complete" | "partial"; key: string };
};

/** Identity + storage for one domain's Event reconciliation receipts. */
export class EventReconciliationReceipt {
  static readonly FAMILY = "eventReconciliation";

  /** `${eventId}:${domain}:${checkpoint}` — the hex checkpoint carries no
   * colon, so the receipt head scope is the `eventId:domain` pair. */
  operationKey(eventId: string, domain: string, checkpoint: string): string {
    return `${eventId}:${domain}:${checkpoint}`;
  }

  /** Stable FNV-1a 32-bit hex over the milestone windows. Deliberately
   * excludes Event.version and timingConfiguredAt — those change on every
   * configureTiming even when the plan is unchanged, which would break
   * replay identity. */
  windowsCheckpoint(windows: readonly TimingWindow[]): string {
    const material = windows
      .map((window) => `${window.key}:${window.startsAt ?? ""}:${window.endsAt ?? ""}`)
      .join("|");
    let hash = 0x811c9dc5;
    for (let i = 0; i < material.length; i++) {
      hash ^= material.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  /** The receipt a prior run of this same operation left behind. */
  async readPrior(
    ctx: MutationCtx,
    tenantId: string,
    operationKey: string,
  ): Promise<ReconciliationReceiptOutput | undefined> {
    return await readMaterializationReceipt<ReconciliationReceiptOutput>(
      ctx,
      tenantId,
      EventReconciliationReceipt.FAMILY,
      operationKey,
      {},
    );
  }

  /** Always after the work, and only after a readPrior miss — the exact row
   * insert throws on a repeated operationKey. */
  async persist(
    ctx: MutationCtx,
    tenantId: string,
    operationKey: string,
    output: ReconciliationReceiptOutput,
  ): Promise<void> {
    await writeMaterializationReceipt(
      ctx,
      tenantId,
      EventReconciliationReceipt.FAMILY,
      operationKey,
      {},
      output,
    );
  }
}

export const eventReconciliationReceipt = new EventReconciliationReceipt();
