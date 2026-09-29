/**
 * Event packet rows change only through generated Manifest commands
 * (2026-09-29). Proves, for convex/lib/eventPacket/commands.ts:
 *   - uploads, evidence imports, deactivations, manager decisions and prints
 *     run EventPacketArtifact/Resolution/Revision commands, which emit their
 *     events (a decision or a print now leaves an audit event);
 *   - the seam's authorization is unchanged: managers (any manageAccess
 *     role) succeed, crew is refused, also on the now-public commands;
 *   - the commands hold the invariants the seam relied on: actor is the
 *     signed-in user, stored bytes are claimed once, a print links only this
 *     event's own files, a print is superseded only by a print of the same
 *     event, and legacy rows cannot be re-registered;
 *   - retries stay idempotent and legacy rows (written by the old raw code,
 *     without registeredAt/printedAt/recordedAt) keep working.
 */
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { beforeAll, describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";
import { ensureTestFieldEncryptionKey } from "./test-field-encryption-key";
import { fingerprintBytes } from "../../src/lib/eventPacket/model";

const packet = anyApi.lib.eventPacket.commands;
const commands = anyApi.mutations;
const TENANT = "packet-governed";

beforeAll(ensureTestFieldEncryptionKey);

async function setup() {
  const t = convexTest(schema, modules);
  const manager = t.withIdentity({
    subject: "packet-manager",
    org_id: TENANT,
    role: "event_manager",
  });
  const crew = t.withIdentity({
    subject: "packet-crew",
    org_id: TENANT,
    role: "kitchen_staff",
  });
  const eventId = await t.run(async (ctx) => {
    const clientId = await ctx.db.insert("clients", {
      tenantId: TENANT,
      clientType: "company",
      companyName: "Packet client",
      taxExempt: false,
      paymentTermsDays: 30,
      status: "active",
      version: 1,
      deletedAt: null,
    });
    const serviceStyleId = await ctx.db.insert("serviceStyles", {
      tenantId: TENANT,
      name: "Bring Hot",
      code: "hot",
      sortOrder: 0,
      status: "active",
      version: 1,
      deletedAt: null,
    });
    return ctx.db.insert("events", {
      tenantId: TENANT,
      clientId,
      serviceStyleId,
      title: "Packet event",
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
  return { t, manager, crew, eventId };
}

async function snapshotFor(bytes: Uint8Array, observationId: string) {
  const fingerprint = await fingerprintBytes(bytes);
  return {
    fingerprint,
    snapshot: {
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
          id: observationId,
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
    },
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function events(t: Setup["t"], type: string) {
  return t.run(async (ctx) =>
    (await ctx.db.query("manifestEvents").collect()).filter(
      (e: any) => e.type === type,
    ),
  );
}

async function upload(
  manager: Setup["manager"],
  eventId: string,
  bytes: Uint8Array,
  purpose: "source" | "pdf" | "snapshot",
  name: string,
  inputFingerprint?: string,
) {
  return manager.action(packet.uploadPacketFile, {
    eventId,
    bytes: bytes.buffer,
    name,
    mimeType: purpose === "pdf" ? "application/pdf" : "text/plain",
    purpose,
    ...(inputFingerprint ? { inputFingerprint } : {}),
  }) as Promise<{ storageId: string; fingerprint: string }>;
}

async function print(manager: Setup["manager"], eventId: string) {
  const p = await manager.query(packet.getPacket, { eventId });
  const pdf = await upload(
    manager,
    eventId,
    new TextEncoder().encode(`%PDF-${p.currentFingerprint}`),
    "pdf",
    "workbook.pdf",
    p.currentFingerprint,
  );
  const snap = await upload(
    manager,
    eventId,
    new TextEncoder().encode(JSON.stringify(p.snapshot)),
    "snapshot",
    "snapshot.json",
  );
  return {
    eventId,
    inputFingerprint: p.currentFingerprint as string,
    pdfStorageId: pdf.storageId,
    snapshotStorageId: snap.storageId,
  };
}

describe("event packet uploads and evidence run generated commands", () => {
  it("registers a file through EventPacketArtifact.register as the uploading manager, once", async () => {
    const { t, manager, eventId } = await setup();
    const bytes = new TextEncoder().encode("source A");
    const first = await upload(manager, eventId, bytes, "source", "src.txt");
    const again = await upload(manager, eventId, bytes, "source", "src.txt");
    expect(again.storageId).toBe(first.storageId);
    const rows = await t.run((ctx) =>
      ctx.db.query("eventPacketArtifacts").collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].uploadedBy).toBe("packet-manager");
    expect(rows[0].registeredAt).toBeGreaterThan(0);
    const registered = await events(t, "EventPacketFileRegistered");
    expect(registered).toHaveLength(1);
    expect(registered[0].entity).toBe("EventPacketArtifact");
    expect(registered[0].entityId).toBe(rows[0]._id);
    expect(registered[0].payload).toMatchObject({
      eventId,
      fingerprint: first.fingerprint,
      purpose: "source",
      uploadedBy: "packet-manager",
    });
  });

  it("imports evidence and deactivates a replaced source through commands, without repeat deactivations", async () => {
    const { t, manager, eventId } = await setup();
    const oldBytes = new TextEncoder().encode("source old");
    const newBytes = new TextEncoder().encode("source new");
    const oldFile = await upload(manager, eventId, oldBytes, "source", "s.txt");
    const oldSnap = await snapshotFor(oldBytes, "old-obs");
    await manager.mutation(packet.importEvidence, {
      eventId,
      snapshotJson: JSON.stringify(oldSnap.snapshot),
      artifacts: [
        { fingerprint: oldSnap.fingerprint, storageId: oldFile.storageId },
      ],
      timeZone: "America/Los_Angeles",
    });
    expect(await events(t, "EventPacketEvidenceImported")).toHaveLength(1);

    const newFile = await upload(manager, eventId, newBytes, "source", "s.txt");
    const newSnap = await snapshotFor(newBytes, "new-obs");
    const args = {
      eventId,
      snapshotJson: JSON.stringify(newSnap.snapshot),
      artifacts: [
        { fingerprint: newSnap.fingerprint, storageId: newFile.storageId },
      ],
      timeZone: "America/Los_Angeles",
    };
    await manager.mutation(packet.importEvidence, args);
    await manager.mutation(packet.importEvidence, args);

    const deactivated = await events(t, "EventPacketSourceDeactivated");
    expect(deactivated).toHaveLength(1);
    expect(deactivated[0].payload.fingerprint).toBe(oldSnap.fingerprint);
    const old = await t.run(async (ctx) =>
      (await ctx.db.query("eventPacketArtifacts").collect()).find(
        (r) => r.fingerprint === oldSnap.fingerprint,
      ),
    );
    expect(JSON.parse(old!.contextJson!).active).toBe(false);
    expect(await events(t, "EventPacketEvidenceImported")).toHaveLength(3);
  });
});

describe("manager decisions and prints leave emitted events", () => {
  it("records a decision through EventPacketResolution.record with the signed-in actor", async () => {
    const { t, manager, eventId } = await setup();
    const bytes = new TextEncoder().encode("source decide");
    const file = await upload(manager, eventId, bytes, "source", "d.txt");
    const { fingerprint, snapshot } = await snapshotFor(bytes, "decide-obs");
    await manager.mutation(packet.importEvidence, {
      eventId,
      snapshotJson: JSON.stringify(snapshot),
      artifacts: [{ fingerprint, storageId: file.storageId }],
      timeZone: "America/Los_Angeles",
    });
    const current = await manager.query(packet.getPacket, { eventId });
    const dropOff = await t.run((ctx) =>
      ctx.db.insert("serviceStyles", {
        tenantId: TENANT,
        name: "Drop Off",
        code: "drop",
        sortOrder: 1,
        status: "active",
        version: 1,
        deletedAt: null,
      }),
    );
    await manager.mutation(packet.resolveOperationalIssue, {
      eventId,
      issueId: "fact.serviceStyle",
      evidenceFingerprint: current.snapshot.issues.find(
        (i: any) => i.id === "fact.serviceStyle",
      ).evidenceFingerprint,
      choice: "Drop Off",
      reason: "Confirmed with operations",
      observationId: "decide-obs",
      nativeTargetId: dropOff,
    });
    const decisions = await t.run((ctx) =>
      ctx.db.query("eventPacketResolutions").collect(),
    );
    expect(decisions).toHaveLength(1);
    expect(decisions[0].actor).toBe("packet-manager");
    expect(decisions[0].recordedAt).toBeGreaterThan(0);
    const resolved = await events(t, "EventPacketIssueResolved");
    expect(resolved).toHaveLength(1);
    expect(resolved[0].entityId).toBe(decisions[0]._id);
    expect(resolved[0].payload).toMatchObject({
      eventId,
      decisionId: decisions[0].decisionId,
      issueKey: "fact.serviceStyle",
      actor: "packet-manager",
      decidedAt: decisions[0].decidedAt,
    });
  });

  it("captures, reuses, supersedes and reinstates prints through EventPacketRevision commands", async () => {
    const { t, manager, eventId } = await setup();
    const firstArgs = await print(manager, eventId);
    const first = await manager.mutation(
      packet.recordPacketRevision,
      firstArgs,
    );
    expect(first.reused).toBe(false);
    // Retry of the same print: same row, no second Printed event.
    expect(
      (await manager.mutation(packet.recordPacketRevision, firstArgs)).id,
    ).toBe(first.id);
    const printed = await events(t, "EventPacketPrinted");
    expect(printed).toHaveLength(1);
    expect(printed[0].payload).toMatchObject({
      revisionId: first.id,
      eventId,
      snapshotFingerprint: firstArgs.inputFingerprint,
      createdBy: "packet-manager",
    });

    const version = (await t.run((ctx) => ctx.db.get(eventId)))!.version;
    await manager.mutation(commands.Event_changeHeadcount, {
      docId: eventId,
      version,
      newHeadcount: 201,
    });
    const second = await manager.mutation(
      packet.recordPacketRevision,
      await print(manager, eventId),
    );
    expect(await events(t, "EventPacketPrinted")).toHaveLength(2);
    const superseded = await events(t, "EventPacketRevisionSuperseded");
    expect(superseded.map((e: any) => e.payload)).toEqual([
      expect.objectContaining({
        revisionId: first.id,
        supersededBy: second.id,
      }),
    ]);

    // Back to the first packet version: reprinting reuses and reinstates it.
    const again = (await t.run((ctx) => ctx.db.get(eventId)))!.version;
    await manager.mutation(commands.Event_changeHeadcount, {
      docId: eventId,
      version: again,
      newHeadcount: 200,
    });
    const reused = await manager.mutation(packet.recordPacketRevision, {
      ...firstArgs,
      inputFingerprint: (await manager.query(packet.getPacket, { eventId }))
        .currentFingerprint,
    });
    expect(reused).toMatchObject({ id: first.id, reused: true });
    expect(await events(t, "EventPacketRevisionReinstated")).toHaveLength(1);
    const rows = await t.run((ctx) =>
      ctx.db.query("eventPacketRevisions").collect(),
    );
    expect(rows.find((r) => r._id === first.id)!.supersededBy ?? null).toBe(
      null,
    );
    expect(rows.find((r) => r._id === second.id)!.supersededBy).toBe(first.id);
  });
});

describe("authorization and invariants on the now-public commands", () => {
  it("refuses crew on the seam and on every generated packet command", async () => {
    const { t, crew, manager, eventId } = await setup();
    const file = await upload(
      manager,
      eventId,
      new TextEncoder().encode("crew probe"),
      "source",
      "c.txt",
    );
    await expect(
      upload(
        crew as never,
        eventId,
        new TextEncoder().encode("x"),
        "source",
        "x",
      ),
    ).rejects.toThrow(/Management access required/);
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["crew"])),
    );
    await expect(
      crew.mutation(commands.EventPacketArtifact_createViaRegister, {
        eventId,
        fingerprint: "f",
        storageId,
        purpose: "source",
        name: "n",
        mimeType: "text/plain",
        byteSize: 4,
      }),
    ).rejects.toThrow(/manager/);
    await expect(
      crew.mutation(commands.EventPacketResolution_createViaRecord, {
        eventId,
        decisionId: "d",
        issueKey: "k",
        decidedAt: 1,
        decisionJson: "{}",
      }),
    ).rejects.toThrow(/manager/);
    await expect(
      crew.mutation(commands.EventPacketRevision_createViaCapture, {
        eventId,
        snapshotFingerprint: "f",
        pdfStorageId: file.storageId,
        snapshotStorageId: file.storageId,
        stage: "draft",
      }),
    ).rejects.toThrow(/manager/);
    const artifactId = await t.run(
      async (ctx) => (await ctx.db.query("eventPacketArtifacts").first())!._id,
    );
    await expect(
      crew.mutation(commands.EventPacketArtifact_recordEvidence, {
        docId: artifactId,
        metadataJson: "{}",
        observationsJson: "[]",
        contextJson: "{}",
      }),
    ).rejects.toThrow(/manager/);
    expect(
      await crew.query(anyApi.queries.listEventPacketArtifact, {}),
    ).toEqual([]);
  });

  it("keeps the seam's invariants when a manager calls the generated commands directly", async () => {
    const { t, manager, eventId } = await setup();
    const file = await upload(
      manager,
      eventId,
      new TextEncoder().encode("owned bytes"),
      "source",
      "o.txt",
    );
    // Stored bytes are claimed once.
    await expect(
      manager.mutation(commands.EventPacketArtifact_createViaRegister, {
        eventId,
        fingerprint: "forged",
        storageId: file.storageId,
        purpose: "source",
        name: "o.txt",
        mimeType: "text/plain",
        byteSize: 1,
      }),
    ).rejects.toThrow(/already belong/);
    // The decision actor is always the signed-in user.
    const { docId } = await manager.mutation(
      commands.EventPacketResolution_createViaRecord,
      {
        eventId,
        decisionId: "direct-decision",
        issueKey: "check.direct",
        decidedAt: 1,
        decisionJson: "{}",
      },
    );
    expect(
      (
        (await t.run((ctx) => ctx.db.get(docId))) as {
          actor?: string;
        } | null
      )?.actor,
    ).toBe("packet-manager");
    // Every manageAccess role the seam accepted still may, e.g. kitchen_manager;
    // retrying the same decision id is refused rather than duplicated.
    const kitchenManager = t.withIdentity({
      subject: "kitchen-manager",
      org_id: TENANT,
      role: "kitchen_manager",
    });
    await kitchenManager.mutation(
      commands.EventPacketResolution_createViaRecord,
      {
        eventId,
        decisionId: "kitchen-decision",
        issueKey: "check.kitchen",
        decidedAt: 2,
        decisionJson: "{}",
      },
    );
    await expect(
      kitchenManager.mutation(commands.EventPacketResolution_createViaRecord, {
        eventId,
        decisionId: "kitchen-decision",
        issueKey: "check.kitchen",
        decidedAt: 2,
        decisionJson: "{}",
      }),
    ).rejects.toThrow(/already saved/);
    // A print must link this event's own PDF and snapshot files.
    await expect(
      manager.mutation(commands.EventPacketRevision_createViaCapture, {
        eventId,
        snapshotFingerprint: "f",
        pdfStorageId: file.storageId,
        snapshotStorageId: file.storageId,
        stage: "draft",
      }),
    ).rejects.toThrow(/belong to this event/);
    // A print can only be superseded by a print of the same event.
    const other = await t.run(async (ctx) => {
      const { _id, _creationTime, ...fields } = (await ctx.db.get(eventId))!;
      return ctx.db.insert("events", fields);
    });
    const [mine, foreign] = await t.run(async (ctx) => [
      await ctx.db.insert("eventPacketRevisions", {
        tenantId: TENANT,
        eventId,
        snapshotFingerprint: "legacy-a",
        pdfStorageId: "p",
        snapshotStorageId: "s",
        stage: "draft",
        createdBy: "legacy-manager",
        createdAt: 1,
        updatedAt: 1,
      }),
      await ctx.db.insert("eventPacketRevisions", {
        tenantId: TENANT,
        eventId: other,
        snapshotFingerprint: "legacy-b",
        pdfStorageId: "p",
        snapshotStorageId: "s",
        stage: "draft",
        createdBy: "legacy-manager",
        createdAt: 1,
        updatedAt: 1,
      }),
    ]);
    await expect(
      manager.mutation(commands.EventPacketRevision_supersede, {
        docId: mine,
        by: foreign,
      }),
    ).rejects.toThrow(/Only another print of this event/);
    // A legacy artifact (no registeredAt) cannot be re-pointed by register.
    const artifactId = await t.run(
      async (ctx) => (await ctx.db.query("eventPacketArtifacts").first())!._id,
    );
    await t.run((ctx) => ctx.db.patch(artifactId, { registeredAt: undefined }));
    await expect(
      manager.mutation(commands.EventPacketArtifact_register, {
        docId: artifactId,
        eventId,
        fingerprint: "other",
        storageId: "other",
        purpose: "source",
        name: "n",
        mimeType: "text/plain",
        byteSize: 1,
      }),
    ).rejects.toThrow(/Guard 0 failed/);
  });

  it("reuses and supersedes legacy prints written by the old raw code", async () => {
    const { t, manager, eventId } = await setup();
    const args = await print(manager, eventId);
    const legacy = await t.run(async (ctx) =>
      Promise.all([
        ctx.db.insert("eventPacketRevisions", {
          tenantId: TENANT,
          eventId,
          snapshotFingerprint: args.inputFingerprint,
          pdfStorageId: args.pdfStorageId,
          snapshotStorageId: args.snapshotStorageId,
          stage: "draft",
          createdBy: "legacy-manager",
          createdAt: 2,
          updatedAt: 2,
        }),
        ctx.db.insert("eventPacketRevisions", {
          tenantId: TENANT,
          eventId,
          snapshotFingerprint: "older-legacy",
          pdfStorageId: "p",
          snapshotStorageId: "s",
          stage: "draft",
          createdBy: "legacy-manager",
          createdAt: 1,
          updatedAt: 1,
        }),
      ]),
    );
    await t.run((ctx) => ctx.db.patch(legacy[0], { supersededBy: legacy[1] }));
    const result = await manager.mutation(packet.recordPacketRevision, args);
    expect(result).toMatchObject({ id: legacy[0], reused: true });
    const rows = await t.run((ctx) =>
      ctx.db.query("eventPacketRevisions").collect(),
    );
    expect(rows.find((r) => r._id === legacy[0])!.supersededBy ?? null).toBe(
      null,
    );
    expect(rows.find((r) => r._id === legacy[1])!.supersededBy).toBe(legacy[0]);
    expect(await events(t, "EventPacketRevisionReinstated")).toHaveLength(1);
    expect(await events(t, "EventPacketRevisionSuperseded")).toHaveLength(1);
    const packetView = await manager.query(packet.getPacket, { eventId });
    expect(packetView.latestRevision.id).toBe(legacy[0]);
    expect(packetView.latestRevision.stale).toBe(false);
  });
});
