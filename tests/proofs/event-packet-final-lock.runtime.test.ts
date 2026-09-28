import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const packet = api.lib.eventPacket.commands;
const finalLock = api.lib.eventPacket.finalLock;

async function setup() {
  const t = convexTest(schema, modules);
  const manager = t.withIdentity({
    subject: "final-lock-manager",
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
  const version = () =>
    t.run(async (ctx) => (await ctx.db.get(eventId))!.version as number);
  return { t, manager, eventId, version };
}

const answer = (report: any, key: string) =>
  report.answers.find((a: any) => a.questionKey === key);

/** Upload a print the way the browser does: PDF plus snapshot with answers. */
async function uploadPrint(
  manager: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  eventId: Id<"events">,
  p: any,
  tag: string,
) {
  const pdf = await manager.action(packet.uploadPacketFile, {
    eventId,
    bytes: new TextEncoder().encode(`%PDF-test ${tag}`).buffer,
    name: "workbook.pdf",
    mimeType: "application/pdf",
    purpose: "pdf",
    inputFingerprint: p.currentFingerprint,
    finalLockFingerprint: p.finalLockFingerprint,
  });
  const snap = await manager.action(packet.uploadPacketFile, {
    eventId,
    bytes: new TextEncoder().encode(
      JSON.stringify({ ...p.snapshot, finalLock: p.finalLock }),
    ).buffer,
    name: "snapshot.json",
    mimeType: "application/json",
    purpose: "snapshot",
  });
  return {
    eventId,
    inputFingerprint: p.currentFingerprint,
    finalLockFingerprint: p.finalLockFingerprint,
    pdfStorageId: pdf.storageId as Id<"_storage">,
    snapshotStorageId: snap.storageId as Id<"_storage">,
  };
}

describe("Final Lock answers from native event records", () => {
  it("derives answers with sources for staff of the workspace; the price stays with managers", async () => {
    const { t, manager, eventId } = await setup();
    const report = await manager.query(finalLock.getFinalLock, { eventId });
    expect(answer(report, "identity.guest_count")).toMatchObject({
      result: "answered",
      value: { type: "count", count: 100 },
      sources: [
        {
          table: "events",
          id: eventId,
          version: 1,
          field: "expectedHeadcount",
        },
      ],
      resolver: "Sales",
    });
    expect(answer(report, "setup.linen_tables")).toMatchObject({
      result: "unresolved",
      missing: ["No table linen color is recorded."],
      action: "Fill in table linen color in the setup notes.",
    });
    expect(answer(report, "field.takeoff-readiness").result).toBe(
      "field_confirmation",
    );
    expect(report.outcome).toBe("needs_review");
    const staff = t.withIdentity({
      subject: "final-lock-staff",
      org_id: "tenant-a",
      role: "staff",
    });
    // Kitchen, logistics and event staff read the same answers and forms.
    const seen = await staff.query(finalLock.getFinalLock, { eventId });
    expect(seen.answers.map((a: any) => a.questionKey)).toEqual(
      report.answers.map((a: any) => a.questionKey),
    );
    expect(answer(seen, "setup.linen_tables")).toEqual(
      answer(report, "setup.linen_tables"),
    );
    expect(answer(report, "identity.billing").value).toEqual({
      type: "record",
      fields: { billTo: "Lakeside Weddings", quotedPrice: 5000 },
    });
    expect(answer(seen, "identity.billing").value).toEqual({
      type: "record",
      fields: { billTo: "Lakeside Weddings" },
    });
    expect(JSON.stringify(answer(seen, "identity.billing"))).not.toContain(
      "5000",
    );
    // Deciding an answer is still a manager's job.
    await expect(
      staff.mutation(finalLock.overrideFinalLockAnswer, {
        eventId,
        questionKey: "setup.linen_tables",
        basedOn: answer(seen, "setup.linen_tables").basis,
        answer: "White",
        reason: "Staff guess",
      }),
    ).rejects.toThrow(/Management access required/);
    const outsider = t.withIdentity({
      subject: "final-lock-outsider",
      org_id: "tenant-b",
      role: "admin",
    });
    await expect(
      outsider.query(finalLock.getFinalLock, { eventId }),
    ).rejects.toThrow(/Event not found/);
  });

  it("records an authorized override with reason, actor and time until the facts change", async () => {
    const { manager, eventId, version } = await setup();
    const before = answer(
      await manager.query(finalLock.getFinalLock, { eventId }),
      "setup.linen_tables",
    );
    const decide = (extra: Record<string, string>) =>
      manager.mutation(finalLock.overrideFinalLockAnswer, {
        eventId,
        questionKey: "setup.linen_tables",
        basedOn: before.basis,
        answer: "Client brings their own linen",
        reason: "The couple bring family tablecloths",
        ...extra,
      });
    await expect(decide({ reason: "  " })).rejects.toThrow(/Say why/);
    await expect(decide({ basedOn: "old" })).rejects.toThrow(/changed/);
    await expect(decide({ questionKey: "field.arrival" })).rejects.toThrow(
      /work done on the day/,
    );
    await decide({});
    const after = answer(
      await manager.query(finalLock.getFinalLock, { eventId }),
      "setup.linen_tables",
    );
    expect(after.result).toBe("answered");
    expect(after.value).toEqual({
      type: "text",
      text: "Client brings their own linen",
    });
    expect(after.override).toMatchObject({
      reason: "The couple bring family tablecloths",
      actor: expect.any(String),
      at: expect.any(String),
    });
    await manager.mutation(api.mutations.Event_updateSetupNotes, {
      docId: eventId,
      version: await version(),
      linenColorTables: "Ivory",
      venueSurface: "Grass",
    });
    const changed = await manager.query(finalLock.getFinalLock, { eventId });
    expect(answer(changed, "setup.linen_tables")).toMatchObject({
      result: "answered",
      value: { type: "text", text: "Ivory" },
      override: null,
    });
    expect(answer(changed, "setup.venue_surface").value).toEqual({
      type: "text",
      text: "Grass",
    });
  });

  it("stores what a print showed and names the stale questions after a change", async () => {
    const { t, manager, eventId, version } = await setup();
    const p = await manager.query(packet.getPacket, { eventId });
    expect(p.finalLock.lines.length).toBeGreaterThan(40);
    const revision = await manager.mutation(
      packet.recordPacketRevision,
      await uploadPrint(manager, eventId, p, "first"),
    );
    expect(revision.reused).toBe(false);
    // The revision stores exactly the answers the uploaded print carried.
    const stored = await t.run(async (ctx) =>
      JSON.parse(
        (await ctx.db.get(revision.id as Id<"eventPacketRevisions">))!
          .answersJson!,
      ),
    );
    expect(stored).toEqual({ revisionId: revision.id, ...p.finalLock });
    const after = await manager.query(packet.getPacket, { eventId });
    expect(after.latestRevision).toMatchObject({
      id: revision.id,
      stale: false,
    });
    const printed = await manager.query(finalLock.getFinalLock, { eventId });
    expect(answer(printed, "identity.venue").displayedInRevision).toBe(
      revision.id,
    );
    expect(printed.staleQuestions).toEqual([]);
    await manager.mutation(api.mutations.Event_updateSetupNotes, {
      docId: eventId,
      version: await version(),
      rainPlan: "Tent on the lawn",
    });
    const later = await manager.query(finalLock.getFinalLock, { eventId });
    expect(later.staleQuestions).toEqual(["setup.rain_plan"]);
    expect(later.staleSections).toEqual(["layouts"]);
    expect(answer(later, "setup.rain_plan")).toMatchObject({
      result: "answered",
      displayedInRevision: null,
    });
    expect(answer(later, "identity.venue").displayedInRevision).toBe(
      revision.id,
    );
    // The printed packet is out of date once a printed answer changed.
    const moved = await manager.query(packet.getPacket, { eventId });
    expect(moved.currentFingerprint).toBe(p.currentFingerprint);
    expect(moved.latestRevision?.stale).toBe(true);
  });

  it("refuses a print whose Final Lock answers changed between upload and recording", async () => {
    const { manager, eventId, version } = await setup();
    const p = await manager.query(packet.getPacket, { eventId });
    const files = await uploadPrint(manager, eventId, p, "race");
    // A Final-Lock-only fact changes; the packet snapshot itself does not.
    await manager.mutation(api.mutations.Event_updateSetupNotes, {
      docId: eventId,
      version: await version(),
      rainPlan: "Tent on the lawn",
    });
    expect(
      (await manager.query(packet.getPacket, { eventId })).currentFingerprint,
    ).toBe(p.currentFingerprint);
    await expect(
      manager.mutation(packet.recordPacketRevision, files),
    ).rejects.toThrow(/Final Lock answers changed/);
    // Files that do not carry the checked answers are refused too.
    const fresh = await manager.query(packet.getPacket, { eventId });
    await expect(
      manager.mutation(packet.recordPacketRevision, {
        ...files,
        finalLockFingerprint: fresh.finalLockFingerprint,
      }),
    ).rejects.toThrow(/must carry the Final Lock answers/);
    const ok = await manager.mutation(
      packet.recordPacketRevision,
      await uploadPrint(manager, eventId, fresh, "fresh"),
    );
    expect(ok.reused).toBe(false);
  });

  it("reprints an old print without answers, and a print made under another policy version", async () => {
    const { t, manager, eventId } = await setup();
    const p = await manager.query(packet.getPacket, { eventId });
    // An old revision of this exact packet, printed before answers existed.
    const legacy = await t.run(async (ctx) => {
      const pdfStorageId = await ctx.storage.store(new Blob(["%PDF-old"]));
      return ctx.db.insert("eventPacketRevisions", {
        tenantId: "tenant-a",
        eventId,
        snapshotFingerprint: p.currentFingerprint,
        pdfStorageId,
        snapshotStorageId: pdfStorageId,
        stage: "review",
        createdBy: "old",
        createdAt: Date.now() - 1000,
        updatedAt: Date.now() - 1000,
      });
    });
    // Readiness follows the latest print, so each print reads the packet again.
    const read = () => manager.query(packet.getPacket, { eventId });
    const withLegacy = await read();
    expect(withLegacy.latestRevision).toMatchObject({
      id: legacy,
      stale: true,
    });
    const first = await manager.mutation(
      packet.recordPacketRevision,
      await uploadPrint(manager, eventId, withLegacy, "after-legacy"),
    );
    expect(first).toMatchObject({ reused: false });
    expect(first.id).not.toBe(legacy);
    // A print stored under an older policy version is not current either.
    await t.run(async (ctx) => {
      const id = first.id as Id<"eventPacketRevisions">;
      const row = (await ctx.db.get(id))!;
      await ctx.db.patch(id, {
        answersJson: JSON.stringify({
          ...JSON.parse(row.answersJson!),
          policyVersion: "final-lock-older",
        }),
      });
    });
    const older = await read();
    expect(older.latestRevision?.stale).toBe(true);
    const reprint = await manager.mutation(
      packet.recordPacketRevision,
      await uploadPrint(manager, eventId, older, "new-policy"),
    );
    expect(reprint.reused).toBe(false);
    // The same print again is reused, not stored twice.
    const current = await read();
    expect(current.latestRevision).toMatchObject({
      id: reprint.id,
      stale: false,
    });
    const again = await manager.mutation(
      packet.recordPacketRevision,
      await uploadPrint(manager, eventId, current, "same"),
    );
    expect(again).toMatchObject({ id: reprint.id, reused: true });
  });
});
