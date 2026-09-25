/**
 * Runtime proof (AC-398 source-evidence link slice): the Event owns the link
 * to its source/import evidence via the stored `importSourceKey` (written by
 * Event.captureDraft / Event.updateImportDraft). A later catalog ServiceStyle
 * rename must NOT rewrite the stored key, even though the live source file
 * name changes with the imported worksheet — refusal-to-cascade is a
 * snapshot, not a freeze: an explicit updateImportDraft still writes a new
 * key, and omitted fields preserve what is stored.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const M = api.mutations;

const IMPORT_DRAFT_JSON = JSON.stringify({
  version: 1,
  sourceKey: "beo-worksheet-v1",
  sources: [{ storageId: "storage-proof", name: "worksheet.pdf" }],
  facts: {},
  menu: [],
  missing: [],
  issues: [],
  status: "saved",
});

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Proof = ReturnType<typeof harness>;
type Role = ReturnType<Proof["asRole"]>;

function rolesFor(
  proof: Proof,
  tenantId: string,
): { sales: Role; events: Role } {
  return {
    sales: proof.asRole({
      subject: `sales-${tenantId}`,
      role: "sales_manager",
      tenantId,
    }),
    events: proof.asRole({
      subject: `event-manager-${tenantId}`,
      role: "event_manager",
      tenantId,
    }),
  };
}

/** ServiceStyle + captured-draft Event carrying a stored source-evidence key. */
async function createEventWithImportDraft(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<{ eventId: string; styleId: string }> {
  const { sales, events } = rolesFor(proof, tenantId);
  const style = (await proof.executeCommand(
    events,
    M.ServiceStyle_createViaRegister,
    {
      name: "Full Service",
      code: `FULL_SERVICE_${tenantId}`,
      sortOrder: 10,
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    M.Event_createViaCaptureDraft,
    {
      title,
      quotedPrice: 4500,
      importSourceKey: "beo-worksheet-v1",
      importDraftJson: IMPORT_DRAFT_JSON,
      serviceStyleId: style.docId,
      idempotencyKey: `capture-draft-${tenantId}`,
    },
  )) as { docId: string };
  return { eventId: event.docId, styleId: style.docId };
}

type SourceEvidenceSnapshot = {
  stage: string;
  version: number;
  serviceStyleId: string | null;
  quotedPrice: number | null;
  importSourceKey: string | null;
};

async function readEvent(
  actor: Role,
  eventId: string,
): Promise<SourceEvidenceSnapshot> {
  return (await actor.run(async (ctx) =>
    ctx.db.get(eventId as never),
  )) as SourceEvidenceSnapshot;
}

async function readStyle(
  actor: Role,
  styleId: string,
): Promise<{ name: string }> {
  return (await actor.run(async (ctx) => ctx.db.get(styleId as never))) as {
    name: string;
  };
}

function expectStoredDraft(
  event: SourceEvidenceSnapshot,
  sourceKey: string,
  styleId: string,
): void {
  expect(event.stage).toBe("planning");
  expect(event.quotedPrice).toBe(4500);
  expect(event.importSourceKey).toBe(sourceKey);
  expect(event.serviceStyleId).toBe(styleId);
}

describe("runtime proof: Event source-evidence link stays put under catalog edits", () => {
  it("catalog service-style rename leaves the stored source-evidence key", async () => {
    const proof = harness();
    const tenantId = "tenant-ac398-source-evidence-catalog-revise";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, styleId } = await createEventWithImportDraft(
      proof,
      tenantId,
      "Source-evidence link holds under catalog revise",
    );

    const before = await readEvent(events, eventId);
    expectStoredDraft(before, "beo-worksheet-v1", styleId);

    await proof.executeCommand(events, M.ServiceStyle_reviseDetails, {
      docId: styleId,
      name: "Full Service RENAMED",
    });

    const catalog = await readStyle(events, styleId);
    expect(catalog.name).toBe("Full Service RENAMED");

    const after = await readEvent(events, eventId);
    expectStoredDraft(after, "beo-worksheet-v1", styleId);
  });

  it("an explicit updateImportDraft writes a new key and a later catalog rename leaves it", async () => {
    const proof = harness();
    const tenantId = "tenant-ac398-source-evidence-rewrite";
    const { sales, events } = rolesFor(proof, tenantId);
    const { eventId, styleId } = await createEventWithImportDraft(
      proof,
      tenantId,
      "Explicit import-draft rewrite writes a snapshot",
    );

    // Omitted fields must preserve: only the key changes.
    await proof.executeCommand(sales, M.Event_updateImportDraft, {
      docId: eventId,
      importSourceKey: "beo-worksheet-v2",
    });
    const rewritten = await readEvent(events, eventId);
    expect(rewritten.importSourceKey).toBe("beo-worksheet-v2");
    expect(rewritten.quotedPrice).toBe(4500);

    await proof.executeCommand(events, M.ServiceStyle_reviseDetails, {
      docId: styleId,
      name: "Full Service RENAMED 2",
    });

    const catalog = await readStyle(events, styleId);
    expect(catalog.name).toBe("Full Service RENAMED 2");

    const after = await readEvent(events, eventId);
    expectStoredDraft(after, "beo-worksheet-v2", styleId);
  });
});
