/**
 * Binder replacement (spec §14.1 part 8, §1.2 Drive/Dropbox): the files that
 * print at the back of the event packet are the event's setup drawings,
 * floor plans and maps plus the uploaded BEOs and worksheets kept as
 * sources - PDF and pictures only. Other event photos stay out, and another
 * company cannot list them.
 */
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const packet = anyApi.lib.eventPacket.commands;

describe("files printed at the back of the event packet", () => {
  it("lists drawings and kept sources, nothing else, for this company only", async () => {
    const t = convexTest(schema, modules);
    const manager = t.withIdentity({
      subject: "print-files-manager",
      org_id: "tenant-a",
      role: "admin",
    });
    const outsider = t.withIdentity({
      subject: "print-files-outsider",
      org_id: "tenant-b",
      role: "admin",
    });
    const eventId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("events", {
        tenantId: "tenant-a",
        title: "Garden wedding",
        eventType: "Wedding",
        startsAt: Date.parse("2026-11-14T17:00:00Z"),
        endsAt: Date.parse("2026-11-14T23:00:00Z"),
        expectedHeadcount: 120,
        budgetAmount: 0,
        quotedPrice: 0,
        stage: "planning",
        version: 1,
      } as never);
      const file = async (fileName: string, contentType: string, extra = {}) =>
        ctx.db.insert("attachments", {
          tenantId: "tenant-a",
          parentType: "eventRecord",
          parentId: id,
          fileName,
          contentType,
          fileSize: 3,
          storageId: await ctx.storage.store(new Blob(["abc"])),
          version: 1,
          ...extra,
        } as never);
      await file("Floor plan.png", "image/png");
      await file("Tent layout.pdf", "application/pdf", {
        evidenceType: "setup",
      });
      await file("Signed contract.pdf", "application/pdf");
      await file("Plated salmon.jpg", "image/jpeg", { evidenceType: "food" });
      await file("Venue map.docx", "application/msword");
      await ctx.db.insert("eventPacketArtifacts", {
        tenantId: "tenant-a",
        eventId: id,
        purpose: "source",
        name: "BEO 6014.pdf",
        mimeType: "application/pdf",
        storageId: await ctx.storage.store(new Blob(["%PDF-"])),
        fingerprint: "beo-6014",
      } as never);
      return id;
    });

    const files = (await manager.query(packet.packetPrintFiles, {
      eventId,
    })) as Array<{ name: string; contentType: string; url: string }>;
    expect(files.map((f) => f.name)).toEqual([
      "Floor plan.png",
      "Tent layout.pdf",
      "BEO 6014.pdf",
    ]);
    expect(files.every((f) => f.url.length > 0)).toBe(true);

    await expect(
      outsider.query(packet.packetPrintFiles, { eventId }),
    ).rejects.toThrow();
  });
});
