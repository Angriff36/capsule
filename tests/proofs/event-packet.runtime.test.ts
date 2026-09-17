import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { describe, it, expect } from "vitest";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";
import { fingerprintBytes } from "../../src/lib/eventPacket/model";
const api = anyApi.lib.eventPacket.commands;
async function setup() {
  const t = convexTest(schema, modules);
  const manager = t.withIdentity({
    subject: "trusted-manager",
    org_id: "tenant-a",
    role: "admin",
  });
  const eventId = await t.run(async (ctx) => {
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
    const serviceStyleId = await ctx.db.insert("serviceStyles", {
      tenantId: "tenant-a",
      name: "Bring Hot",
      code: "hot",
      sortOrder: 0,
      status: "active",
      version: 1,
      deletedAt: null,
    });
    return ctx.db.insert("events", {
      tenantId: "tenant-a",
      clientId,
      serviceStyleId,
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
  const bytes = new TextEncoder().encode("source event Drop Off");
  const fingerprint = await fingerprintBytes(bytes);
  const snapshot = {
    schemaVersion: 1,
    identity: {
      tenantId: "pilot",
      invoiceNumber: "6837",
      eventDate: "2026-09-17",
    },
    artifacts: [
      {
        fingerprint,
        name: "worksheet",
        mimeType: "text/plain",
        kind: "worksheet",
        parserVersion: "1",
        recognitionEvidence: ["worksheet"],
        importedAt: "2026-09-15T00:00:00Z",
      },
    ],
    observations: [
      {
        id: "service-source",
        fieldKey: "serviceStyle",
        value: "Drop Off",
        evidence: [
          { artifactFingerprint: fingerprint, parserVersion: "1", page: 1 },
        ],
        observedAt: "2026-09-15T00:00:00Z",
      },
    ],
    facts: [],
    issues: [],
    resolutions: [],
    checklistVerifications: [],
    revisions: [],
    stage: "draft",
  };
  return { t, manager, eventId, bytes, fingerprint, snapshot };
}
describe("event packet native commands", () => {
  it("imports owned evidence idempotently without overriding native service style or trusting imported facts", async () => {
    const { t, manager, eventId, bytes, fingerprint, snapshot } = await setup();
    const upload = await manager.action(api.uploadPacketFile, {
      eventId,
      bytes: bytes.buffer,
      name: "source.txt",
      mimeType: "text/plain",
      purpose: "source",
    });
    const args = {
      eventId,
      snapshotJson: JSON.stringify({
        ...snapshot,
        facts: [
          {
            fieldKey: "serviceStyle",
            value: "Forged",
            status: "confirmed",
            authority: "native_finalized",
            confidence: 1,
            evidence: [],
          },
        ],
      }),
      artifacts: [{ fingerprint, storageId: upload.storageId }],
      timeZone: "America/Los_Angeles",
    };
    await manager.mutation(api.importEvidence, args);
    await manager.mutation(api.importEvidence, args);
    const packet = await manager.query(api.getPacket, { eventId });
    expect(
      packet.snapshot.facts.find((f: any) => f.fieldKey === "serviceStyle")
        .value,
    ).toBe("Bring Hot");
    expect(
      packet.snapshot.issues.find((i: any) => i.key === "fact.serviceStyle")
        .status,
    ).toBe("open");
    expect(packet.snapshot.resolutions).toHaveLength(0);
    expect(
      await t.run((ctx) => ctx.db.query("eventPacketArtifacts").collect()),
    ).toHaveLength(1);
  });
  it("rejects crew and cross-tenant evidence access", async () => {
    const { t, eventId } = await setup();
    for (const identity of [
      { subject: "crew", org_id: "tenant-a", role: "staff" },
      { subject: "other", org_id: "tenant-b", role: "admin" },
    ]) {
      await expect(
        t.withIdentity(identity).query(api.getPacket, { eventId }),
      ).rejects.toThrow();
    }
  });
  it("updates service through the native command, audits trusted actor, and reopens after a native change", async () => {
    const { t, manager, eventId, bytes, fingerprint, snapshot } = await setup();
    const file = await manager.action(api.uploadPacketFile, {
      eventId,
      bytes: bytes.buffer,
      name: "source",
      mimeType: "text/plain",
      purpose: "source",
    });
    await manager.mutation(api.importEvidence, {
      eventId,
      snapshotJson: JSON.stringify(snapshot),
      artifacts: [{ fingerprint, storageId: file.storageId }],
      timeZone: "America/Los_Angeles",
    });
    const current = await manager.query(api.getPacket, { eventId });
    const target = await t.run((ctx) =>
      ctx.db.insert("serviceStyles", {
        tenantId: "tenant-a",
        name: "Drop Off",
        code: "drop",
        sortOrder: 0,
        status: "active",
        version: 1,
        deletedAt: null,
      }),
    );
    await manager.mutation(api.resolveOperationalIssue, {
      eventId,
      issueId: "fact.serviceStyle",
      evidenceFingerprint: current.snapshot.issues.find(
        (i: any) => i.id === "fact.serviceStyle",
      ).evidenceFingerprint,
      choice: "Drop Off",
      reason: "Confirmed with operations",
      observationId: "service-source",
      nativeTargetId: target,
    });
    expect((await t.run((ctx) => ctx.db.get(eventId)))?.serviceStyleId).toBe(
      target,
    );
    const decisions = await t.run((ctx) =>
      ctx.db.query("eventPacketResolutions").collect(),
    );
    expect(decisions[0].actor).toBe("trusted-manager");
    expect(decisions[0].decidedAt).toBeGreaterThan(0);
    const native = await t.run((ctx) => ctx.db.get(eventId));
    const original = await t.run(async (ctx) =>
      (await ctx.db.query("serviceStyles").collect()).find(
        (s) => s.name === "Bring Hot",
      )!,
    );
    await manager.mutation(anyApi.mutations.Event_changeServiceStyle, {
      docId: eventId,
      version: native!.version,
      serviceStyleId: original._id,
    });
    expect(
      (await manager.query(api.getPacket, { eventId })).snapshot.issues.find(
        (i: any) => i.key === "fact.serviceStyle",
      ).status,
    ).toBe("open");
  });
  it("stores immutable exact-current revisions and rejects stale or foreign file links", async () => {
    const { manager, eventId } = await setup();
    const p = await manager.query(api.getPacket, { eventId });
    const pdf = await manager.action(api.uploadPacketFile, {
      eventId,
      bytes: new TextEncoder().encode("%PDF-test").buffer,
      name: "workbook.pdf",
      mimeType: "application/pdf",
      purpose: "pdf",
      inputFingerprint: p.currentFingerprint,
    });
    const snap = await manager.action(api.uploadPacketFile, {
      eventId,
      bytes: new TextEncoder().encode(JSON.stringify(p.snapshot)).buffer,
      name: "snapshot.json",
      mimeType: "application/json",
      purpose: "snapshot",
    });
    const args = {
      eventId,
      inputFingerprint: p.currentFingerprint,
      pdfStorageId: pdf.storageId,
      snapshotStorageId: snap.storageId,
    };
    const first = await manager.mutation(api.recordPacketRevision, args);
    expect((await manager.mutation(api.recordPacketRevision, args)).id).toBe(
      first.id,
    );
    await manager.mutation(anyApi.mutations.Event_changeHeadcount, {
      docId: eventId,
      version: 1,
      newHeadcount: 201,
    });
    await expect(
      manager.mutation(api.recordPacketRevision, args),
    ).rejects.toThrow(/changed/);
    expect(
      (await manager.query(api.getPacket, { eventId })).latestRevision.stale,
    ).toBe(true);
  });
});

it("invalidates the current workbook when native packing quantities change", async () => {
  const { t, manager, eventId } = await setup();
  const item = await t.run(async (ctx) => {
    const packListId = await ctx.db.insert("packLists", {
      tenantId: "tenant-a",
      eventId,
      name: "Event packing",
      status: "draft",
      version: 1,
      deletedAt: null,
    });
    return ctx.db.insert("packListItems", {
      tenantId: "tenant-a",
      packListId,
      description: "Desserts",
      requiredQuantity: 200,
      packedQuantity: 0,
      unit: "each",
      status: "listed",
      version: 1,
      deletedAt: null,
    });
  });
  const before = await manager.query(api.getPacket, { eventId });
  await t.run((ctx) => ctx.db.patch(item, { requiredQuantity: 250 }));
  const after = await manager.query(api.getPacket, { eventId });
  expect(after.currentFingerprint).not.toBe(before.currentFingerprint);
});
it("rejects storage links from another event and a changed established invoice", async () => {
  const { t, manager, eventId, bytes, fingerprint, snapshot } = await setup();
  const upload = await manager.action(api.uploadPacketFile, {
    eventId,
    bytes: bytes.buffer,
    name: "source",
    mimeType: "text/plain",
    purpose: "source",
  });
  const second = await t.run(async (ctx) => {
    const first = (await ctx.db.get(eventId))!;
    const { _id, _creationTime, ...fields } = first;
    return ctx.db.insert("events", fields);
  });
  const args = {
    eventId,
    snapshotJson: JSON.stringify(snapshot),
    artifacts: [{ fingerprint, storageId: upload.storageId }],
    timeZone: "America/Los_Angeles",
  };
  await expect(
    manager.mutation(api.importEvidence, { ...args, eventId: second }),
  ).rejects.toThrow(/Upload every source/);
  await manager.mutation(api.importEvidence, args);
  await expect(
    manager.mutation(api.importEvidence, {
      ...args,
      snapshotJson: JSON.stringify({
        ...snapshot,
        identity: { ...snapshot.identity, invoiceNumber: "9999" },
      }),
    }),
  ).rejects.toThrow(/invoice/);
});
