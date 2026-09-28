import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { PDFDocument } from "pdf-lib";
import { appendFinalLockPages } from "../../src/lib/eventPacket/finalLock/pdfStamp";
import { printableText } from "../../src/lib/eventPacket/printableText";
import { extractPagesFromPdfDocument } from "../../src/lib/pdf/extractPdfText";
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
  const staff = t.withIdentity({
    subject: "final-lock-staff",
    org_id: "tenant-a",
    role: "staff",
  });
  const ids = await t.run(async (ctx) => {
    const clientId = await ctx.db.insert("clients", {
      tenantId: "tenant-a",
      clientType: "company",
      companyName: "José’s Lakeside Weddings",
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
    const eventId = await ctx.db.insert("events", {
      tenantId: "tenant-a",
      clientId,
      clientName: "José’s Lakeside Weddings",
      serviceStyleId,
      serviceStyleName: "Full Service",
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
    return { clientId, serviceStyleId, eventId };
  });
  return { t, manager, staff, ...ids };
}

const answer = (report: any, key: string) =>
  report.answers.find((a: any) => a.questionKey === key);

describe("Final Lock answers keep the payer, booked names, sign-off versions and printed words", () => {
  it("a manager's who-pays decision keeps the payer for staff and the price for managers only", async () => {
    const { manager, staff, eventId } = await setup();
    const before = answer(
      await manager.query(finalLock.getFinalLock, { eventId }),
      "identity.billing",
    );
    await expect(
      manager.mutation(finalLock.overrideFinalLockAnswer, {
        eventId,
        questionKey: "identity.billing",
        basedOn: before.basis,
        answer: "Harbor Trust",
        price: -1,
        reason: "The bride’s aunt pays",
      }),
    ).rejects.toThrow(/0 or more/);
    await manager.mutation(finalLock.overrideFinalLockAnswer, {
      eventId,
      questionKey: "identity.billing",
      basedOn: before.basis,
      answer: "Harbor Trust",
      price: 4200,
      reason: "The bride’s aunt pays 4200",
    });
    const seenByManager = await manager.query(finalLock.getFinalLock, {
      eventId,
    });
    const managerBilling = answer(seenByManager, "identity.billing");
    expect(managerBilling.value).toEqual({
      type: "record",
      fields: { billTo: "Harbor Trust", quotedPrice: 4200 },
    });
    const line = (r: any) =>
      r.print.lines.find((l: any) => l.questionKey === "identity.billing").text;
    expect(line(seenByManager)).toContain("Harbor Trust pays 4200");

    const seenByStaff = await staff.query(finalLock.getFinalLock, { eventId });
    const staffBilling = answer(seenByStaff, "identity.billing");
    expect(staffBilling.value).toEqual({
      type: "record",
      fields: { billTo: "Harbor Trust" },
    });
    expect(staffBilling.override.value).toEqual({
      type: "record",
      fields: { billTo: "Harbor Trust" },
    });
    expect(staffBilling.explanation).toContain("Harbor Trust pays");
    expect(line(seenByStaff)).toContain("Harbor Trust pays");
    expect(JSON.stringify(seenByManager)).toMatch(/\b4200\b/);
    expect(JSON.stringify(seenByStaff)).not.toMatch(/\b4200\b/);
    expect(JSON.stringify(seenByStaff)).not.toMatch(/\b5000\b/);
  });

  it("a catalog rename does not change any answer, printed line or staleness when the event booked the name", async () => {
    const { t, manager, eventId, clientId, serviceStyleId } = await setup();
    const before = await manager.query(finalLock.getFinalLock, { eventId });
    expect(
      answer(before, "identity.service_style").sources.map((s: any) => s.table),
    ).not.toContain("serviceStyles");
    expect(
      answer(before, "identity.customer").sources.map((s: any) => s.table),
    ).not.toContain("clients");
    await t.run(async (ctx) => {
      await ctx.db.patch(serviceStyleId, {
        name: "Full Service Deluxe",
        version: 2,
      });
      await ctx.db.patch(clientId, {
        companyName: "Lakeside Group",
        version: 2,
      });
    });
    const after = await manager.query(finalLock.getFinalLock, { eventId });
    expect(
      after.answers.map((a: any) => [a.questionKey, a.fingerprint]),
    ).toEqual(before.answers.map((a: any) => [a.questionKey, a.fingerprint]));
    expect(after.print).toEqual(before.print);
    expect(answer(after, "identity.service_style").value).toEqual({
      type: "choice",
      choice: "Full Service",
    });

    // With no booked name the live catalog row is the source, and its
    // change shows.
    await t.run(async (ctx) => {
      await ctx.db.patch(eventId, { serviceStyleName: undefined });
    });
    const unbooked = await manager.query(finalLock.getFinalLock, { eventId });
    expect(
      answer(unbooked, "identity.service_style").sources.map(
        (s: any) => s.table,
      ),
    ).toContain("serviceStyles");
    expect(answer(unbooked, "identity.service_style").value.choice).toBe(
      "Full Service Deluxe",
    );
  });

  it("an empty event chat does not hold the event for review", async () => {
    const { manager, eventId } = await setup();
    const report = await manager.query(finalLock.getFinalLock, { eventId });
    expect(answer(report, "communication.channel")).toMatchObject({
      result: "answered",
      value: { type: "record", fields: { messages: 0, attachments: 0 } },
      missing: [],
      action: null,
    });
  });

  it("the sign-offs a Final Lock answer reads name their saved record with a version", async () => {
    const { t, manager, eventId } = await setup();
    const p = await manager.query(packet.getPacket, { eventId });
    const keys = p.snapshot.issues.map((i: any) => i.key);
    const sign = async (key: string) => {
      const current = await manager.query(packet.getPacket, { eventId });
      const issue = current.snapshot.issues.find((i: any) => i.key === key)!;
      await manager.mutation(packet.resolveOperationalIssue, {
        eventId,
        issueId: issue.id,
        evidenceFingerprint: issue.evidenceFingerprint,
        choice: "yes",
        answer: "yes",
        reason: "Checked on the floor",
      });
    };
    const signature = keys.find((k: string) =>
      k.startsWith("check.signature."),
    );
    expect(signature).toBeDefined();
    await sign(signature);
    // A completed day-of form, saved before decisions carried a version.
    const form = "field.arrival";
    await t.run(async (ctx) => {
      await ctx.db.insert("eventPacketResolutions", {
        tenantId: "tenant-a",
        eventId,
        decisionId: "arrival-form",
        issueKey: form,
        actor: "final-lock-staff",
        decidedAt: Date.now(),
        decisionJson: JSON.stringify({ id: "arrival-form" }),
        verificationJson: JSON.stringify({
          checkKey: form,
          answer: "yes",
          actor: "final-lock-staff",
          at: new Date().toISOString(),
        }),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    const report = await manager.query(finalLock.getFinalLock, { eventId });
    const rows = await t.run(async (ctx) =>
      ctx.db.query("eventPacketResolutions").collect(),
    );
    const bySource = (a: any) =>
      a.sources.filter((s: any) => s.table === "eventPacketResolutions");
    const readinessSources = bySource(answer(report, "readiness.dispatch"));
    const formSources = bySource(answer(report, form));
    for (const s of [...readinessSources, ...formSources]) {
      expect(s.version).toBe(1);
      expect(rows.map((r) => String(r._id))).toContain(s.id);
    }
    expect(readinessSources.length).toBeGreaterThan(0);
    expect(formSources.length).toBeGreaterThan(0);
    // Decisions saved now carry version 1; the older row reads as 1 too.
    expect(
      rows
        .filter((r) => r.decisionId !== "arrival-form")
        .every((r) => r.version === 1),
    ).toBe(true);
  });

  it("the stored printed words are exactly the words drawn in the PDF, names with accents and curly quotes included", async () => {
    const { manager, eventId } = await setup();
    const report = await manager.query(finalLock.getFinalLock, { eventId });
    const customer = report.print.lines.find(
      (l: any) => l.questionKey === "identity.customer",
    )!;
    expect(customer.text).toBe(printableText(customer.text));
    expect(customer.text).not.toContain("’");
    for (const l of report.print.lines) {
      expect(l.text).toBe(printableText(l.text));
      expect(l.label).toBe(printableText(l.label));
    }
    const blank = await PDFDocument.create();
    blank.addPage();
    const stamped = await appendFinalLockPages(
      await blank.save(),
      report.print,
      {
        invoiceNumber: "6014",
        eventDate: "2026-10-10",
      },
    );
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pages = await extractPagesFromPdfDocument(
      await getDocument({ data: stamped.slice(), disableFontFace: true })
        .promise,
    );
    const drawn = pages
      .map((pg) => pg.text)
      .join("")
      .replace(/\s+/g, "");
    for (const l of report.print.lines)
      expect(drawn).toContain(`${l.label}: ${l.text}`.replace(/\s+/g, ""));
  });
});
