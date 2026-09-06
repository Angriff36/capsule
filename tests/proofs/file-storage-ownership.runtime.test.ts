import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

/**
 * Runtime proof AC-029 (PR12-05): URL retrieval and metadata verify the
 * file's tenant and an authorized parent record. A storage id resolves to
 * a URL only through a live referencing row in the caller's tenant — an
 * Attachment row (any parent type) or a Dish/Ingredient primary image.
 * Knowing a bare storage id, or holding one that only another tenant
 * references, yields no URL; a removed/purged reference stops resolving.
 * Synthetic tenants and records only.
 */

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

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;

/** Store real bytes through the harness storage (no tenant — bytes are tenant-free). */
async function storeBlob(actor: Actor, text: string): Promise<string> {
  return (await actor.run(async (ctx) =>
    (
      ctx as unknown as {
        storage: { store: (blob: Blob) => Promise<string> };
      }
    ).storage.store(new Blob([text])),
  )) as string;
}

async function urlsFor(
  actor: Actor,
  storageIds: string[],
): Promise<Record<string, string | null>> {
  return (await actor.query(api.fileStorage.urlsForStorageIds, {
    storageIds,
  })) as Record<string, string | null>;
}

describe("runtime proof: file storage ownership (AC-029)", () => {
  it("a storage id outside authorized parent records yields no URL", async () => {
    const proof = harness();
    const tenantA = "tenant-files-a";
    const tenantB = "tenant-files-b";
    const ownerA = proof.asRole({
      subject: "files-owner-a",
      role: "owner",
      tenantId: tenantA,
    });
    const ownerB = proof.asRole({
      subject: "files-owner-b",
      role: "owner",
      tenantId: tenantB,
    });

    // Three real stored blobs: a dish image (referenced only by the Dish
    // row's field), an event document (referenced only by an Attachment
    // row), and an orphan upload referenced by nothing — the bare-id probe.
    const dishImageId = await storeBlob(ownerA, "dish-image-bytes");
    const documentId = await storeBlob(ownerA, "document-bytes");
    const orphanId = await storeBlob(ownerA, "orphan-upload-bytes");
    expect(new Set([dishImageId, documentId, orphanId]).size).toBe(3);

    // Authorized parent records through the real governed commands the
    // uploaders use: Dish_createViaIntroduce → Dish_setPrimaryImage, and
    // Attachment_createViaAttach (the dish image deliberately has NO
    // Attachment row, so each leg proves its own reference surface).
    const dish = (await proof.executeCommand(
      ownerA,
      api.mutations.Dish_createViaIntroduce,
      { name: "Proof salmon", portionSize: 1, portionUnit: "serving" },
    )) as { docId: string };
    await proof.executeCommand(ownerA, api.mutations.Dish_setPrimaryImage, {
      docId: dish.docId,
      storageId: dishImageId,
      fileName: "salmon.jpg",
    });
    const attachment = (await proof.executeCommand(
      ownerA,
      api.mutations.Attachment_createViaAttach,
      {
        parentType: "eventRecord",
        parentId: "evt-files-proof",
        fileName: "contract.pdf",
        contentType: "application/pdf",
        fileSize: 15,
        storageId: documentId,
      },
    )) as { docId: string };

    // Positive: the caller's own live parent records resolve URLs (the
    // DishPrimaryImage / useStorageUrls production paths).
    const own = await urlsFor(ownerA, [dishImageId, documentId]);
    expect(own[dishImageId]).toMatch(/^https?:\/\//);
    expect(own[documentId]).toMatch(/^https?:\/\//);

    // Bare id: the blob exists, but no row in the tenant references it —
    // knowing a storage id grants nothing.
    const orphan = await urlsFor(ownerA, [orphanId]);
    expect(orphan[orphanId]).toBeNull();

    // Cross-tenant: tenant B holds the exact same ids but references none.
    const foreign = await urlsFor(ownerB, [dishImageId, documentId, orphanId]);
    expect(foreign[dishImageId]).toBeNull();
    expect(foreign[documentId]).toBeNull();
    expect(foreign[orphanId]).toBeNull();

    // Metadata leg: the generated listAttachmentByStorageId stays
    // tenant-filtered — the owning tenant sees its row, the foreign tenant
    // sees nothing.
    const ownMeta = (await ownerA.query(api.queries.listAttachmentByStorageId, {
      storageId: documentId,
    })) as { fileName: string }[];
    expect(ownMeta.map((row) => row.fileName)).toEqual(["contract.pdf"]);
    const foreignMeta = (await ownerB.query(
      api.queries.listAttachmentByStorageId,
      { storageId: documentId },
    )) as unknown[];
    expect(foreignMeta).toEqual([]);

    // Removed reference: Attachment_remove soft-deletes the row, so the
    // document's storage id stops resolving even for its own tenant.
    await proof.executeCommand(ownerA, api.mutations.Attachment_remove, {
      docId: attachment.docId,
    });
    const removed = await urlsFor(ownerA, [documentId]);
    expect(removed[documentId]).toBeNull();

    // Same liveness rule on the entity-field surface: Dish_purge soft-deletes
    // the dish, so its primary image stops resolving.
    await proof.executeCommand(ownerA, api.mutations.Dish_purge, {
      docId: dish.docId,
    });
    const purged = await urlsFor(ownerA, [dishImageId]);
    expect(purged[dishImageId]).toBeNull();
  });
});
