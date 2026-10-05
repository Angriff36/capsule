import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { describe, it, expect } from "vitest";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";
import fixture from "../../src/lib/eventPacket/fixtures/liberty-mutual-6837.sources.sanitized.json";
import { importSources } from "../../src/lib/eventPacket/importSources";
import { fingerprintBytes } from "../../src/lib/eventPacket/model";
import { reconcile } from "../../src/lib/eventPacket/reconcile";

// AC-555: every kept source stays on its event with a server-made checksum,
// who added it, when, and the time zone its times were read in; pictures
// (setup diagrams) are kept too. AC-556: parsed values become observations
// and scoped questions; a disagreeing source never changes the event.
const api = anyApi.lib.eventPacket.commands;
const worksheetText = fixture.documents
  .filter((d) => "pages" in d && d.pages)
  .map((d) => (d as { pages: { text: string }[] }).pages)
  .find((pages) => /Event Worksheet/.test(pages[0]?.text ?? ""))!
  .map((p) => p.text)
  .join("\n");
/** The first bytes of a PNG picture are enough for Capsule to know it. */
const diagramBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3,
]);
const zone = "America/Los_Angeles";

async function setup() {
  const t = convexTest(schema, modules);
  const manager = t.withIdentity({
    subject: "evidence-manager",
    org_id: "tenant-a",
    role: "admin",
  });
  const eventId = await t.run(async (ctx) => {
    await ctx.db.insert("people", {
      tenantId: "tenant-a",
      givenName: "Pat",
      familyName: "Manager",
      email: "pat@example.com",
      role: "admin",
      employmentType: "full_time",
      status: "active",
      authSubjectId: "evidence-manager",
      version: 1,
      deletedAt: null,
    } as never);
    const clientId = await ctx.db.insert("clients", {
      tenantId: "tenant-a",
      clientType: "company",
      companyName: "Test client",
      taxExempt: false,
      paymentTermsDays: 30,
      status: "active",
      version: 1,
      deletedAt: null,
    });
    return ctx.db.insert("events", {
      tenantId: "tenant-a",
      clientId,
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
    });
  });
  /** The panel's steps: read the files, upload each, import what was read. */
  const attach = async (
    files: { name: string; mimeType: string; bytes: Uint8Array }[],
  ) => {
    const view = await manager.query(api.getPacket, { eventId });
    const result = await importSources(files, {
      tenantId: "tenant-a",
      importedAt: "2026-09-15T00:00:00Z",
      existingArtifacts: view.snapshot.artifacts,
    });
    const candidate = result.candidates[0] ?? {
      identity: view.snapshot.identity,
      sources: [],
      observations: [],
    };
    const included = [...candidate.sources, ...result.sharedReferences];
    const attached = [];
    for (const source of included) {
      const bytes = result.artifactBytes.find(
        (b) => b.artifact.fingerprint === source.artifact.fingerprint,
      )!.bytes;
      const stored = await manager.action(api.uploadPacketFile, {
        eventId,
        bytes: new Uint8Array(bytes).buffer,
        name: source.artifact.name,
        mimeType: source.artifact.mimeType,
        purpose: "source",
      });
      attached.push({
        fingerprint: source.artifact.fingerprint,
        storageId: stored.storageId,
      });
    }
    await manager.mutation(api.importEvidence, {
      eventId,
      snapshotJson: JSON.stringify({
        schemaVersion: 1,
        identity: { ...candidate.identity, eventId },
        artifacts: included.map((s) => s.artifact),
        observations: candidate.observations,
        facts: [],
        issues: [],
        resolutions: [],
        checklistVerifications: [],
        revisions: [],
        stage: "review",
      }),
      artifacts: attached,
      timeZone: zone,
    });
    return manager.query(api.getPacket, { eventId });
  };
  return { t, manager, eventId, attach };
}

const text = (name: string, body: string) => ({
  name,
  mimeType: "text/plain",
  bytes: new TextEncoder().encode(body),
});

describe("event packet source evidence", () => {
  it("keeps every source on its event with checksum, who, when and time zone; a diagram picture first never fixes the event number", async () => {
    const { t, eventId, attach } = await setup();
    // A setup diagram alone, before any worksheet.
    const afterDiagram = await attach([
      { name: "setup.png", mimeType: "image/png", bytes: diagramBytes },
    ]);
    expect(afterDiagram.sources).toHaveLength(1);
    const diagram = afterDiagram.sources[0];
    expect(diagram).toMatchObject({
      name: "setup.png",
      kind: "diagram",
      mimeType: "image/png",
      byteSize: diagramBytes.byteLength,
      uploadedBy: "Pat Manager",
      timeZone: zone,
      valuesRead: 0,
      replaced: false,
    });
    expect(diagram.checksum).toBe(await fingerprintBytes(diagramBytes));
    expect(Date.parse(diagram.uploadedAt)).not.toBeNaN();

    // The worksheet still sets the packet's event number afterwards.
    const worksheet = text("worksheet.txt", worksheetText);
    const afterWorksheet = await attach([worksheet]);
    expect(afterWorksheet.snapshot.identity.invoiceNumber).toBe("6837");
    const kept = afterWorksheet.sources.find(
      (s: { name: string }) => s.name === "worksheet.txt",
    );
    expect(kept).toMatchObject({ kind: "worksheet", replaced: false });
    expect(kept.valuesRead).toBeGreaterThan(0);

    // The checksum is of the bytes Capsule actually stored.
    const rows = await t.run((ctx) =>
      ctx.db.query("eventPacketArtifacts").collect(),
    );
    for (const row of rows) {
      const stored = await t.run(async (ctx) => {
        const blob = await ctx.storage.get(row.storageId!);
        return fingerprintBytes(new Uint8Array(await blob!.arrayBuffer()));
      });
      expect(stored).toBe(row.fingerprint);
      expect(row.tenantId).toBe("tenant-a");
      expect(row.eventId).toBe(eventId);
    }

    // Same file again adds nothing; a newer copy keeps the old one, marked replaced.
    await attach([worksheet]);
    const newer = await attach([
      text(
        "worksheet.txt",
        worksheetText.replace("Guest Count: 200", "Guest Count: 210"),
      ),
    ]);
    const copies = newer.sources.filter(
      (s: { name: string }) => s.name === "worksheet.txt",
    );
    expect(copies).toHaveLength(2);
    expect(copies.filter((s: { replaced: boolean }) => s.replaced)).toEqual([
      expect.objectContaining({ checksum: kept.checksum }),
    ]);

    // Another workspace cannot read any of it.
    await expect(
      t
        .withIdentity({ subject: "other", org_id: "tenant-b", role: "admin" })
        .query(api.getPacket, { eventId }),
    ).rejects.toThrow();
  });

  it("turns disagreeing sources into scoped questions and never changes the event", async () => {
    const { t, eventId, attach } = await setup();
    const packet = await attach([
      text(
        "worksheet.txt",
        worksheetText.replace("Guest Count: 200", "Guest Count: 150"),
      ),
    ]);
    const observed = packet.snapshot.observations.filter(
      (o: { fieldKey: string }) => o.fieldKey === "guestCount",
    );
    expect(observed.map((o: { value: number }) => o.value)).toEqual([150]);
    const guests = packet.snapshot.facts.find(
      (f: { fieldKey: string }) => f.fieldKey === "guestCount",
    );
    expect(guests).toMatchObject({ value: 200, authority: "native_finalized" });
    const question = packet.snapshot.issues.find(
      (i: { key: string }) => i.key === "fact.guestCount",
    );
    expect(question).toMatchObject({ fieldKey: "guestCount", status: "open" });
    expect(question.message).toContain("150");
    expect(question.message).toContain("200");
    // The question belongs to one field in one packet part.
    expect(question.section).toEqual(expect.any(String));

    // Two sources that disagree with each other where the event has nothing.
    const snapshot = {
      ...packet.snapshot,
      facts: [],
      issues: [],
      resolutions: [],
      revisions: [],
      artifacts: packet.snapshot.artifacts,
      observations: [
        ...packet.snapshot.observations.filter(
          (o: { fieldKey: string }) => o.fieldKey !== "venue.name",
        ),
        {
          id: "venue-a",
          fieldKey: "venue.name",
          value: "Hall A",
          evidence: [
            {
              artifactFingerprint: packet.snapshot.artifacts[0].fingerprint,
              parserVersion: "1",
            },
          ],
        },
        {
          id: "venue-b",
          fieldKey: "venue.name",
          value: "Hall B",
          evidence: [
            {
              artifactFingerprint: packet.snapshot.artifacts[0].fingerprint,
              parserVersion: "1",
            },
          ],
        },
      ],
    };
    const result = await reconcile(snapshot, []);
    const venue = result.facts.find(
      (f: { fieldKey: string }) => f.fieldKey === "venue.name",
    );
    expect(venue).toMatchObject({ status: "conflicted" });
    expect(venue?.value).toBeUndefined();
    expect(
      result.issues.find((i: { key: string }) => i.key === "fact.venue.name"),
    ).toMatchObject({ status: "open" });

    const event = await t.run((ctx) => ctx.db.get(eventId));
    expect(event).toMatchObject({ expectedHeadcount: 200 });
    expect(event?.venueName).toBeUndefined();
  });
});
