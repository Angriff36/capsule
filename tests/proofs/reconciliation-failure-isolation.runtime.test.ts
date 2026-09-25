/**
 * Runtime proof (AC-424 BE-8.3 failure isolation): a timing reconciler throw
 * on a cancelled Event is caught and recorded, purchasing still stands down,
 * and the parent receipt never reports fully reconciled while any domain
 * failed. A cancel with no configured timing is a clean no-op for timing, so
 * purchasing-only cancel is fully reconciled.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  configureTiming,
  createPlannedEvent,
  harness,
  livePurchaseNeeds,
  openPurchaseNeed,
  readEvent,
  readReconciliationReceipts,
  rolesFor,
} from "./reconciliation-failure-isolation.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: AC-424 reconciliation failure isolation on Event.cancel", () => {
  it(
    "timing reconciler failure does not block purchasing stand-down; " +
      "parent never reports fully reconciled",
    async () => {
      const proof = harness();
      const tenantId = "tenant-ac424-isolation";
      const { events } = rolesFor(proof, tenantId);
      const { eventId } = await createPlannedEvent(
        proof,
        tenantId,
        "Isolation cancel",
      );

      await configureTiming(proof, events, eventId, 1, 180);
      await openPurchaseNeed(proof, tenantId, eventId);

      const event = await readEvent(events, eventId);
      await proof.executeCommand(events, api.mutations.Event_cancel, {
        docId: eventId,
        version: event.version,
        reason: "Client postponed",
      });

      const cancelled = await readEvent(events, eventId);
      expect(cancelled.stage).toBe("cancelled");

      const needs = await livePurchaseNeeds(events, eventId);
      expect(needs).toHaveLength(1);
      expect(needs[0]!.status).toBe("cancelled");
      expect(needs[0]!.cancellationReason).toBe("Client postponed");

      const receipts = await readReconciliationReceipts(events, tenantId);
      const timingException = receipts.find(
        (row) =>
          row.eventId === eventId &&
          JSON.stringify(row.affectedDomains) === JSON.stringify(["timing"]) &&
          row.exceptionCount === 1 &&
          row.checkpoint.state === "partial" &&
          row.fullyReconciled === false &&
          row.unresolved[0] !== undefined &&
          row.unresolved[0]!.code.includes(
            "Calculated timing requires an active event",
          ),
      );
      expect(timingException).toBeDefined();

      const parent = receipts.find(
        (row) =>
          row.eventId === eventId &&
          JSON.stringify(row.affectedDomains) ===
            JSON.stringify(["timing", "purchasing"]) &&
          row.checkpoint.state === "partial" &&
          row.fullyReconciled === false &&
          row.exceptionCount >= 1 &&
          row.triggerType === "EventCancelled" &&
          typeof row.triggerEventId === "string" &&
          row.triggerEventId.length > 0,
      );
      expect(parent).toBeDefined();

      const anyFullyReconciled = receipts.some(
        (row) => row.eventId === eventId && row.fullyReconciled === true,
      );
      expect(anyFullyReconciled).toBe(false);
    },
  );

  it("cancel without configured timing still stands down purchasing", async () => {
    const proof = harness();
    const tenantId = "tenant-ac424-no-timing";
    const { events } = rolesFor(proof, tenantId);
    const { eventId } = await createPlannedEvent(
      proof,
      tenantId,
      "No timing cancel",
    );

    await openPurchaseNeed(proof, tenantId, eventId);

    const event = await readEvent(events, eventId);
    await proof.executeCommand(events, api.mutations.Event_cancel, {
      docId: eventId,
      version: event.version,
      reason: "Client postponed",
    });

    const cancelled = await readEvent(events, eventId);
    expect(cancelled.stage).toBe("cancelled");

    const needs = await livePurchaseNeeds(events, eventId);
    expect(needs).toHaveLength(1);
    expect(needs[0]!.status).toBe("cancelled");
    expect(needs[0]!.cancellationReason).toBe("Client postponed");

    const receipts = await readReconciliationReceipts(events, tenantId);
    const parent = receipts.find(
      (row) =>
        row.eventId === eventId &&
        row.affectedDomains.includes("purchasing") &&
        row.affectedDomains.includes("timing") &&
        row.fullyReconciled === true &&
        row.checkpoint.state === "complete" &&
        row.exceptionCount === 0,
    );
    expect(parent).toBeDefined();

    const timingException = receipts.some(
      (row) =>
        row.eventId === eventId &&
        JSON.stringify(row.affectedDomains) === JSON.stringify(["timing"]) &&
        row.exceptionCount === 1,
    );
    expect(timingException).toBe(false);
  });
});
