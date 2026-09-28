/**
 * Runtime proof (AC-388 documents slice): a printed event packet is history
 * (§14.1) and is never rewritten, so when the event changes after printing the
 * live readiness view shows the office that the packet is out of date
 * (§14.1 "a later relevant change marks that revision out of date"; §14.2
 * Final readiness "packet current"). It uses the same test as the packet page
 * (getPacket latestRevision.stale), and the warning goes once a new packet is
 * prepared from the event as it is now, or the event moves back.
 */
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const packet = anyApi.lib.eventPacket.commands;

type Issue = { code: string; affectedIds: string[]; resolvingAction: string };
type Readiness = { domains: Array<{ domain: string; issues: Issue[] }> };

async function setup() {
  const t = convexTest(schema, modules);
  const manager = t.withIdentity({
    subject: "trusted-manager",
    org_id: "tenant-a",
    role: "admin",
  });
  const eventId = await t.run((ctx) =>
    ctx.db.insert("events", {
      tenantId: "tenant-a",
      title: "Native event",
      eventType: "Lunch",
      startsAt: Date.parse("2026-09-17T17:00:00Z"),
      endsAt: Date.parse("2026-09-17T18:00:00Z"),
      expectedHeadcount: 200,
      budgetAmount: 0,
      quotedPrice: 0,
      stage: "planning",
      version: 1,
      deletedAt: null,
    }),
  );
  return { t, manager, eventId };
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

async function packetIssues(manager: any, eventId: string) {
  const readiness = (await manager.query(
    anyApi.eventReadiness.getEventReadiness,
    { eventId },
  )) as Readiness;
  return readiness.domains
    .find((entry) => entry.domain === "packet")!
    .issues.filter((issue) => issue.code === "packet.out_of_date");
}

async function changeHeadcount(
  t: any,
  manager: any,
  eventId: string,
  n: number,
) {
  const row = await t.run((ctx: any) => ctx.db.get(eventId));
  await manager.mutation(anyApi.mutations.Event_changeHeadcount, {
    docId: eventId,
    version: row.version,
    newHeadcount: n,
  });
}

describe("readiness shows an out-of-date printed packet", () => {
  it("shows nothing before a packet is printed or while it is current", async () => {
    const { manager, eventId } = await setup();
    expect(await packetIssues(manager, eventId)).toEqual([]);
    await printPacket(manager, eventId);
    expect(await packetIssues(manager, eventId)).toEqual([]);
  });

  it("warns after the event changes, and the warning goes once a new packet is printed", async () => {
    const { t, manager, eventId } = await setup();
    const first = await printPacket(manager, eventId);
    await changeHeadcount(t, manager, eventId, 240);

    const issues = await packetIssues(manager, eventId);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.affectedIds).toEqual([first.id]);
    expect(issues[0]!.resolvingAction).toBe("EventPacket.recordPacketRevision");
    expect(
      (await manager.query(packet.getPacket, { eventId })).latestRevision.stale,
    ).toBe(true);

    // The printed packet is history: the warning never rewrites it.
    const kept: any = await t.run((ctx: any) => ctx.db.get(first.id));
    expect(kept.supersededBy).toBeUndefined();

    const second = await printPacket(manager, eventId);
    expect(second.id).not.toBe(first.id);
    expect(await packetIssues(manager, eventId)).toEqual([]);
  });

  it("the warning goes when the event moves back to what was printed", async () => {
    const { t, manager, eventId } = await setup();
    await printPacket(manager, eventId);
    await changeHeadcount(t, manager, eventId, 240);
    expect(await packetIssues(manager, eventId)).toHaveLength(1);
    await changeHeadcount(t, manager, eventId, 200);
    expect(await packetIssues(manager, eventId)).toEqual([]);
  });
});
