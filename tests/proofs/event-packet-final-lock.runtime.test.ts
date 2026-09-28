import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const packet = anyApi.lib.eventPacket.commands;
const finalLock = anyApi.lib.eventPacket.finalLock;

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

describe("Final Lock answers from native event records", () => {
  it("derives answers with sources for managers only, in their own workspace", async () => {
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
    await expect(
      staff.query(finalLock.getFinalLock, { eventId }),
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
    await manager.mutation(anyApi.mutations.Event_updateSetupNotes, {
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
    const { manager, eventId, version } = await setup();
    const p = await manager.query(packet.getPacket, { eventId });
    const pdf = await manager.action(packet.uploadPacketFile, {
      eventId,
      bytes: new TextEncoder().encode("%PDF-test").buffer,
      name: "workbook.pdf",
      mimeType: "application/pdf",
      purpose: "pdf",
      inputFingerprint: p.currentFingerprint,
    });
    const snap = await manager.action(packet.uploadPacketFile, {
      eventId,
      bytes: new TextEncoder().encode(JSON.stringify(p.snapshot)).buffer,
      name: "snapshot.json",
      mimeType: "application/json",
      purpose: "snapshot",
    });
    const revision = await manager.mutation(packet.recordPacketRevision, {
      eventId,
      inputFingerprint: p.currentFingerprint,
      pdfStorageId: pdf.storageId,
      snapshotStorageId: snap.storageId,
    });
    const printed = await manager.query(finalLock.getFinalLock, { eventId });
    expect(answer(printed, "identity.venue").displayedInRevision).toBe(
      revision.id,
    );
    expect(printed.staleQuestions).toEqual([]);
    await manager.mutation(anyApi.mutations.Event_updateSetupNotes, {
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
  });
});
