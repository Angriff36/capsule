import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import {
  canonicalJson,
  fingerprintBytes,
} from "../../src/lib/eventPacket/model";
import { PDFDocument } from "pdf-lib";
import { buildWorkbook } from "../../src/lib/eventPacket/buildWorkbook";
import { renderWorkbook } from "../../src/lib/eventPacket/renderWorkbook";
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

/** A small real PDF with no Final Lock answers on it. */
async function plainPdf(tag: string) {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.setTitle(tag);
  return doc.save();
}

/** The words on every page of a PDF, spaces removed (rows may wrap). */
async function pdfWords(bytes: Uint8Array) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pages = await extractPagesFromPdfDocument(
    await getDocument({ data: bytes.slice(), disableFontFace: true }).promise,
  );
  return {
    count: pages.length,
    words: pages
      .map((pg) => pg.text)
      .join("")
      .replace(/\s+/g, ""),
  };
}

/**
 * Upload a print the way the browser does: PDF plus snapshot with answers.
 * `pdfFinalLockFingerprint` is the answers the PDF upload names, when it
 * differs from the answers the snapshot and the record name.
 */
async function uploadPrint(
  manager: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  eventId: Id<"events">,
  p: any,
  tag: string,
  pdfBytes?: Uint8Array,
) {
  const bytes = pdfBytes ?? (await plainPdf(tag));
  const pdf = await manager.action(packet.uploadPacketFile, {
    eventId,
    bytes: bytes.slice().buffer,
    name: "workbook.pdf",
    mimeType: "application/pdf",
    purpose: "pdf",
    inputFingerprint: p.currentFingerprint,
    finalLockFingerprint: p.pdfFinalLockFingerprint ?? p.finalLockFingerprint,
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
    // The rain plan was open on the printed readiness line; both changed.
    expect(later.staleQuestions.sort()).toEqual([
      "readiness.dispatch",
      "setup.rain_plan",
    ]);
    expect(later.staleSections).toContain("layouts");
    expect(answer(later, "setup.rain_plan")).toMatchObject({
      result: "answered",
      displayedInRevision: null,
    });
    expect(answer(later, "identity.venue").displayedInRevision).toBe(
      revision.id,
    );
    // Readiness knows the printed answers are out of date.
    expect(answer(printed, "readiness.dispatch").missing).not.toContain(
      "The printed event packet is out of date.",
    );
    expect(answer(later, "readiness.dispatch")).toMatchObject({
      result: "unresolved",
    });
    expect(answer(later, "readiness.dispatch").missing).toContain(
      "The printed event packet is out of date.",
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
      await uploadPrint(manager, eventId, older, "same"),
    );
    expect(again).toMatchObject({ id: reprint.id, reused: true });
  });

  it("checks the uploaded answers before reusing an earlier print", async () => {
    const { manager, eventId } = await setup();
    const read = () => manager.query(packet.getPacket, { eventId });
    // A snapshot and record naming other answers than the server drew into
    // the PDF (the PDF upload itself names the current answers).
    const consistent = async (p: any, finalLock: any, tag: string) =>
      uploadPrint(
        manager,
        eventId,
        {
          ...p,
          finalLock,
          pdfFinalLockFingerprint: p.finalLockFingerprint,
          finalLockFingerprint: await fingerprintBytes(
            new TextEncoder().encode(canonicalJson(finalLock)),
          ),
        },
        tag,
      );
    // With no print yet (first loop) and with a print to reuse (second loop).
    let first: { id: string } | null = null;
    let firstPrint: any = null;
    for (const round of ["before", "after"]) {
      const p = await read();
      const refused = [
        // Files that show changed or no answers.
        await uploadPrint(
          manager,
          eventId,
          { ...p, finalLock: { ...p.finalLock, lines: [] } },
          `${round}-changed`,
        ),
        await uploadPrint(
          manager,
          eventId,
          { ...p, finalLock: undefined },
          `${round}-missing`,
        ),
        // A print naming other answers than its files carry.
        {
          ...(await uploadPrint(manager, eventId, p, `${round}-named`)),
          finalLockFingerprint: "not-the-answers",
        },
      ];
      for (const files of refused)
        await expect(
          manager.mutation(packet.recordPacketRevision, files),
        ).rejects.toThrow(/must carry the Final Lock answers/);
      // A snapshot that shows an office answer that is not the current one
      // (and not what the server drew into the PDF).
      const edited = {
        ...p.finalLock,
        lines: p.finalLock.lines.map((l: any) =>
          l.questionKey === "setup.rain_plan" ? { ...l, text: "Edited" } : l,
        ),
      };
      const editedFiles = await consistent(p, edited, `${round}-edited`);
      await expect(
        manager.mutation(packet.recordPacketRevision, editedFiles),
      ).rejects.toThrow(/must carry the Final Lock answers/);
      if (!first) {
        firstPrint = p;
        first = await manager.mutation(
          packet.recordPacketRevision,
          await uploadPrint(manager, eventId, p, "first"),
        );
        // Pressing print again with the same files reuses the print.
        const firstFiles = await uploadPrint(manager, eventId, p, "again");
        expect(
          await manager.mutation(packet.recordPacketRevision, firstFiles),
        ).toMatchObject({ id: first.id, reused: true });
      }
    }
    // A retry that uploads the same answers again reuses the print.
    const ok = await manager.mutation(
      packet.recordPacketRevision,
      await uploadPrint(manager, eventId, firstPrint, "retry"),
    );
    expect(ok).toMatchObject({ id: first!.id, reused: true });
  });

  it("reuses an earlier print only when every printed line matches, readiness and field lines too", async () => {
    const { manager, eventId } = await setup();
    const p = await manager.query(packet.getPacket, { eventId });
    const first = await manager.mutation(
      packet.recordPacketRevision,
      await uploadPrint(manager, eventId, p, "first"),
    );
    for (const key of ["readiness.dispatch", "field.arrival"]) {
      const altered = {
        ...p.finalLock,
        lines: p.finalLock.lines.map((l: any) =>
          l.questionKey === key ? { ...l, text: "Altered" } : l,
        ),
      };
      expect(altered.lines.some((l: any) => l.text === "Altered")).toBe(true);
      const alteredFingerprint = await fingerprintBytes(
        new TextEncoder().encode(canonicalJson(altered)),
      );
      // A PDF upload naming the altered answers is refused outright.
      await expect(
        uploadPrint(
          manager,
          eventId,
          { ...p, finalLockFingerprint: alteredFingerprint },
          `altered-pdf-${key}`,
        ),
      ).rejects.toThrow(/Final Lock answers changed/);
      // A snapshot naming them is refused at the record.
      const files = await uploadPrint(
        manager,
        eventId,
        {
          ...p,
          finalLock: altered,
          pdfFinalLockFingerprint: p.finalLockFingerprint,
          finalLockFingerprint: alteredFingerprint,
        },
        `altered-${key}`,
      );
      await expect(
        manager.mutation(packet.recordPacketRevision, files),
      ).rejects.toThrow(/must carry the Final Lock answers/);
    }
    expect(
      await manager.mutation(
        packet.recordPacketRevision,
        await uploadPrint(manager, eventId, p, "same"),
      ),
    ).toMatchObject({ id: first.id, reused: true });
    // A fresh read after the first print: the recorded print is current,
    // every printed line (readiness and field forms too) is still the same,
    // and a retry from that read reuses the same print.
    const fresh = await manager.query(packet.getPacket, { eventId });
    expect(fresh.latestRevision).toMatchObject({ id: first.id, stale: false });
    expect(fresh.finalLock).toEqual(p.finalLock);
    expect(fresh.finalLockFingerprint).toBe(p.finalLockFingerprint);
    const report = await manager.query(finalLock.getFinalLock, { eventId });
    expect(report.outcome).not.toBe("stale");
    expect(report.staleQuestions).toEqual([]);
    for (const key of [
      "readiness.dispatch",
      "field.arrival",
      "setup.rain_plan",
    ])
      expect(answer(report, key).displayedInRevision).toBe(first.id);
    expect(
      await manager.mutation(
        packet.recordPacketRevision,
        await uploadPrint(manager, eventId, fresh, "retry-after-read"),
      ),
    ).toMatchObject({ id: first.id, reused: true });
  });

  it("the server draws the checked answers into the stored PDF: a blank PDF with the old answer stamp still shows every answer", async () => {
    const { t, manager, eventId, version } = await setup();
    const p = await manager.query(packet.getPacket, { eventId });
    const storedPdf = async (revisionId: string) =>
      new Uint8Array(
        await t.run(async (ctx) => {
          const row = (await ctx.db.get(
            revisionId as Id<"eventPacketRevisions">,
          ))!;
          const blob = await ctx.storage.get(
            row.pdfStorageId as Id<"_storage">,
          );
          return blob!.arrayBuffer();
        }),
      );
    const showsEvery = async (bytes: Uint8Array, lines: any[]) => {
      const { words } = await pdfWords(bytes);
      expect(words).toContain("FinalLockanswers");
      for (const l of lines)
        expect(words).toContain(
          printableText(`${l.label}: ${l.text}`).replace(/\s+/g, ""),
        );
    };
    // A blank one-page PDF carrying the old caller-written answer stamp.
    const blankDoc = await PDFDocument.create();
    blankDoc.addPage();
    blankDoc.setSubject(`capsule-final-lock:${p.finalLockFingerprint}`);
    const blank = await blankDoc.save();
    expect((await pdfWords(blank)).words).toBe("");
    const first = await manager.mutation(
      packet.recordPacketRevision,
      await uploadPrint(manager, eventId, p, "blank", blank),
    );
    const stored = await storedPdf(first.id);
    expect((await pdfWords(stored)).count).toBeGreaterThan(1);
    await showsEvery(stored, p.finalLock.lines);
    // After a Final-Lock-only change, a PDF upload naming the old answers
    // is refused.
    await manager.mutation(api.mutations.Event_updateSetupNotes, {
      docId: eventId,
      version: await version(),
      rainPlan: "Tent on the lawn",
    });
    const fresh = await manager.query(packet.getPacket, { eventId });
    await expect(
      uploadPrint(
        manager,
        eventId,
        { ...fresh, pdfFinalLockFingerprint: p.finalLockFingerprint },
        "stale-pdf",
      ),
    ).rejects.toThrow(/Final Lock answers changed/);
    // The real rendered workbook of the current answers is recorded with
    // the server's answer pages at the end, numbered with the workbook.
    const rendered = await renderWorkbook(
      buildWorkbook(fresh.snapshot, {
        revision: 2,
        generatedAt: "2026-09-28T00:00:00Z",
        finalLock: fresh.finalLock.lines,
      }),
    );
    const ok = await manager.mutation(
      packet.recordPacketRevision,
      await uploadPrint(manager, eventId, fresh, "real", rendered.bytes),
    );
    expect(ok.reused).toBe(false);
    const real = await storedPdf(ok.id);
    const { count, words } = await pdfWords(real);
    expect(count).toBe(rendered.audit.mergedPageCount);
    expect(words).toContain(`Page${count}/${count}`);
    expect(words).toContain("Tentonthelawn");
    await showsEvery(real, fresh.finalLock.lines);
  });
});
