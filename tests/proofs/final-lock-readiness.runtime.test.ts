/**
 * Runtime proof (AC-388 Final Lock answers leg): the answer engine's outcome
 * reaches the office readiness list (spec §14.2 "Operations should review a
 * short exception list"). The packet fingerprint never sees the event
 * conversation, an accepted proposal or a recipe cost, so an answers-only
 * change leaves the printed packet "current" — the readiness view still
 * names the changed questions. Office questions nobody answered show as the
 * review exception, a manager's override clears its question, and the whole
 * reply carries no answer values (readiness is readable by any staff
 * member, so no price can leak).
 */
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const packet = anyApi.lib.eventPacket.commands;
const finalLock = anyApi.lib.eventPacket.finalLock;
const readinessApi = anyApi.eventReadiness.getEventReadiness;

type Issue = {
  code: string;
  affectedIds: string[];
  resolvingAction: string;
  severity: string;
};
type Readiness = { domains: Array<{ domain: string; issues: Issue[] }> };

function issuesOf(readiness: Readiness, code: string) {
  return readiness.domains
    .find((entry) => entry.domain === "packet")!
    .issues.filter((issue) => issue.code === code);
}

async function setup() {
  const t = convexTest(schema, modules);
  const manager = t.withIdentity({
    subject: "final-lock-readiness-manager",
    org_id: "tenant-a",
    role: "admin",
  });
  const eventId = await t.run(async (ctx) => {
    const clientId = await ctx.db.insert("clients", {
      tenantId: "tenant-a",
      clientType: "company",
      companyName: "Lakeside Weddings",
      taxExempt: false,
      paymentTermsDays: 30,
      status: "active",
      version: 1,
      deletedAt: null,
    });
    const serviceStyleId = await ctx.db.insert("serviceStyles", {
      tenantId: "tenant-a",
      name: "Full Service",
      code: "full",
      sortOrder: 0,
      status: "active",
      version: 1,
      deletedAt: null,
    });
    return ctx.db.insert("events", {
      tenantId: "tenant-a",
      clientId,
      serviceStyleId,
      title: "Ashley's Wedding",
      eventType: "Wedding",
      eventNumber: "6014",
      venueName: "Lakeside Lawn",
      venueAddress: "1 Shore Road",
      startsAt: Date.parse("2026-10-10T18:00:00Z"),
      endsAt: Date.parse("2026-10-10T21:00:00Z"),
      expectedHeadcount: 100,
      budgetAmount: 0,
      quotedPrice: 5000,
      stage: "planning",
      version: 1,
      deletedAt: null,
    });
  });
  return { t, manager, eventId };
}

async function readiness(manager: any, eventId: string) {
  return (await manager.query(readinessApi, { eventId })) as Readiness;
}

/** A real PDF; the server adds the Final Lock answer pages itself. */
async function workbookPdf() {
  const doc = await PDFDocument.create();
  doc.addPage();
  return doc.save();
}

async function printPacket(manager: any, eventId: string) {
  const current = await manager.query(packet.getPacket, { eventId });
  const pdf = await manager.action(packet.uploadPacketFile, {
    eventId,
    bytes: (await workbookPdf()).buffer,
    name: "workbook.pdf",
    mimeType: "application/pdf",
    purpose: "pdf",
    inputFingerprint: current.currentFingerprint,
    finalLockFingerprint: current.finalLockFingerprint,
  });
  const snap = await manager.action(packet.uploadPacketFile, {
    eventId,
    bytes: new TextEncoder().encode(
      JSON.stringify({ ...current.snapshot, finalLock: current.finalLock }),
    ).buffer,
    name: "snapshot.json",
    mimeType: "application/json",
    purpose: "snapshot",
  });
  return (await manager.mutation(packet.recordPacketRevision, {
    eventId,
    inputFingerprint: current.currentFingerprint,
    finalLockFingerprint: current.finalLockFingerprint,
    pdfStorageId: pdf.storageId,
    snapshotStorageId: snap.storageId,
  })) as { id: string };
}

/** One event chat message from a person of the workspace. */
async function postChatMessage(t: any, eventId: string) {
  await t.run(async (ctx: any) => {
    const senderPersonId = await ctx.db.insert("people", {
      tenantId: "tenant-a",
      givenName: "Avery",
      familyName: "Quinn",
      email: "avery.quinn@example.test",
      role: "event_staff",
      employmentType: "part_time",
      status: "active",
      version: 1,
      deletedAt: null,
    });
    await ctx.db.insert("staffMessages", {
      tenantId: "tenant-a",
      senderPersonId,
      eventId,
      body: "Client added two guests to the lawn count.",
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

describe("readiness shows the Final Lock answer outcome", () => {
  it("lists the office questions nobody answered, and a manager decision clears its question", async () => {
    const { manager, eventId } = await setup();
    const before = await readiness(manager, eventId);
    const review = issuesOf(before, "packet.final_lock_needs_review");
    expect(review).toHaveLength(1);
    expect(review[0]!.resolvingAction).toBe("overrideFinalLockAnswer");
    const engine = await manager.query(finalLock.getFinalLock, { eventId });
    const openKeys = engine.answers
      .filter((a: any) => a.result === "unresolved" && !a.fieldWork)
      .map((a: any) => a.questionKey);
    expect(openKeys.length).toBeGreaterThan(0);
    expect(review[0]!.affectedIds).toEqual(openKeys);
    expect(openKeys).toContain("setup.linen_tables");

    await manager.mutation(finalLock.overrideFinalLockAnswer, {
      eventId,
      questionKey: "setup.linen_tables",
      basedOn: engine.answers.find(
        (a: any) => a.questionKey === "setup.linen_tables",
      ).basis,
      answer: "Client brings their own linen",
      reason: "The couple bring family tablecloths",
    });

    const after = await readiness(manager, eventId);
    const stillOpen = issuesOf(after, "packet.final_lock_needs_review");
    expect(stillOpen).toHaveLength(1);
    expect(stillOpen[0]!.affectedIds).not.toContain("setup.linen_tables");
    // Readiness is staff-readable: no answer value may ride along.
    expect(JSON.stringify(after)).not.toMatch(/\b5000\b/);
    expect(JSON.stringify(after)).not.toMatch(/pays/i);
  });

  it("names the changed questions when answers moved behind a current packet, and a reprint clears them", async () => {
    const { t, manager, eventId } = await setup();
    await printPacket(manager, eventId);
    const printed = await readiness(manager, eventId);
    expect(issuesOf(printed, "packet.out_of_date")).toEqual([]);
    expect(issuesOf(printed, "packet.final_lock_stale")).toEqual([]);

    // The event chat is a Final Lock answer source the packet fingerprint
    // never reads: one message changes the printed words and nothing else.
    await postChatMessage(t, eventId);

    const changed = await readiness(manager, eventId);
    expect(issuesOf(changed, "packet.out_of_date")).toEqual([]);
    const stale = issuesOf(changed, "packet.final_lock_stale");
    expect(stale).toHaveLength(1);
    expect(stale[0]!.resolvingAction).toBe("EventPacket.recordPacketRevision");
    expect(stale[0]!.affectedIds).toContain("communication.channel");

    await printPacket(manager, eventId);
    const reprinted = await readiness(manager, eventId);
    expect(issuesOf(reprinted, "packet.final_lock_stale")).toEqual([]);
  });

  it("after every office question is decided only the day-of confirmations remain", async () => {
    const { manager, eventId } = await setup();
    // Decide each open office question until the engine reports none left.
    for (;;) {
      const current = await readiness(manager, eventId);
      const review = issuesOf(current, "packet.final_lock_needs_review");
      if (review.length === 0) break;
      const openBefore = review[0]!.affectedIds.length;
      const engine = await manager.query(finalLock.getFinalLock, { eventId });
      const next = engine.answers.find(
        (a: any) => a.result === "unresolved" && !a.fieldWork,
      );
      expect(next).toBeDefined();
      await manager.mutation(finalLock.overrideFinalLockAnswer, {
        eventId,
        questionKey: next.questionKey,
        basedOn: next.basis,
        answer: "Decided in the office",
        reason: "Confirmed with the client by phone",
      });
      const settled = await readiness(manager, eventId);
      const still = issuesOf(settled, "packet.final_lock_needs_review");
      if (still.length > 0)
        expect(still[0]!.affectedIds.length).toBeLessThan(openBefore);
    }
    const done = await readiness(manager, eventId);
    expect(issuesOf(done, "packet.final_lock_needs_review")).toEqual([]);
    expect(issuesOf(done, "packet.final_lock_stale")).toEqual([]);
    const fieldWork = issuesOf(done, "packet.final_lock_field_work");
    expect(fieldWork).toHaveLength(1);
    expect(fieldWork[0]!.resolvingAction).toBe("resolveOperationalIssue");
    // Day-of work that is not due yet is normal: it stays info, never blocking.
    expect(
      done.domains.every((entry) =>
        entry.issues.every((issue) => issue.severity !== "blocking"),
      ),
    ).toBe(true);
  });
});
