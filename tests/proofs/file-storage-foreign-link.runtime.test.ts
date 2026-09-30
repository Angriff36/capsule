import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

/**
 * Runtime proof AC-029 (PR12-05), association and share legs: a file
 * belongs to the company and record it was uploaded for (the first
 * Attachment row written for it). Linking another company's storage id to
 * your own record, or copying a private chat photo's id into another
 * message or record, shows the file's name but never the file. Client links
 * never hand out a file, and a turned-off link hands out nothing at all.
 * Synthetic tenants and records only.
 */

const KEY = "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY = KEY;
  }
});

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;

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

async function parentUrls(
  actor: Actor,
  parentId: string,
): Promise<Array<{ fileName: string; url: string | null }>> {
  return (await actor.query(api.fileStorage.listForParent, {
    parentType: "eventRecord",
    parentId,
  })) as Array<{ fileName: string; url: string | null }>;
}

describe("runtime proof: a storage id linked elsewhere grants nothing (AC-029)", () => {
  it("another company's record naming the id shows no file", async () => {
    const proof = harness();
    const ownerA = proof.asRole({
      subject: "link-owner-a",
      role: "owner",
      tenantId: "tenant-link-a",
    });
    const ownerB = proof.asRole({
      subject: "link-owner-b",
      role: "owner",
      tenantId: "tenant-link-b",
    });

    const documentId = await storeBlob(ownerA, "signed-contract-bytes");
    await proof.executeCommand(
      ownerA,
      api.mutations.Attachment_createViaAttach,
      {
        parentType: "eventRecord",
        parentId: "evt-link-a",
        fileName: "contract.pdf",
        contentType: "application/pdf",
        fileSize: 21,
        storageId: documentId,
      },
    );

    // Company B learns the id and links it to its own event record and to
    // its own dish image, through the same governed commands.
    await proof.executeCommand(
      ownerB,
      api.mutations.Attachment_createViaAttach,
      {
        parentType: "eventRecord",
        parentId: "evt-link-b",
        fileName: "borrowed.pdf",
        contentType: "application/pdf",
        fileSize: 21,
        storageId: documentId,
      },
    );
    const dishB = (await proof.executeCommand(
      ownerB,
      api.mutations.Dish_createViaIntroduce,
      { name: "Borrowed image dish", portionSize: 1, portionUnit: "serving" },
    )) as { docId: string };
    await proof.executeCommand(ownerB, api.mutations.Dish_setPrimaryImage, {
      docId: dishB.docId,
      storageId: documentId,
      fileName: "borrowed.jpg",
    });

    // B sees its own row's name, never the file, on both read paths.
    expect((await urlsFor(ownerB, [documentId]))[documentId]).toBeNull();
    const borrowed = await parentUrls(ownerB, "evt-link-b");
    expect(borrowed.map((row) => row.fileName)).toEqual(["borrowed.pdf"]);
    expect(borrowed[0]?.url).toBeNull();

    // A still opens its own file on both paths.
    expect((await urlsFor(ownerA, [documentId]))[documentId]).toMatch(
      /^https?:\/\//,
    );
    const own = await parentUrls(ownerA, "evt-link-a");
    expect(own[0]?.url).toMatch(/^https?:\/\//);
  });

  it("a client link hands out no file, and a turned-off link hands out nothing", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "share-owner",
      role: "owner",
      tenantId: "tenant-share-files",
    });
    const client = (await proof.executeCommand(
      owner,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Share files client" },
    )) as { docId: string };
    const event = (await proof.executeCommand(
      owner,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Share files dinner",
        eventType: "catering",
        startsAt: Date.UTC(2026, 9, 2, 16, 0),
        endsAt: Date.UTC(2026, 9, 2, 22, 0),
        expectedHeadcount: 40,
        primaryContactName: "Pat Planner",
        budgetAmount: 2000,
        quotedPrice: 2400,
      },
    )) as { docId: string };
    const fileId = await storeBlob(owner, "event-floor-plan-bytes");
    await proof.executeCommand(
      owner,
      api.mutations.Attachment_createViaAttach,
      {
        parentType: "eventRecord",
        parentId: event.docId,
        fileName: "floor-plan.pdf",
        contentType: "application/pdf",
        fileSize: 22,
        storageId: fileId,
      },
    );
    const staffUrl = (await urlsFor(owner, [fileId]))[fileId];
    expect(staffUrl).toMatch(/^https?:\/\//);

    const link = (await proof.executeCommand(
      owner,
      api.lib.clientPortalLinks.issueClientPortalLink,
      { eventId: event.docId },
    )) as string;
    const view = await owner.query(api.clientPortal.getEvent, { token: link });
    expect((view as { event?: { title?: string } } | null)?.event?.title).toBe(
      "Share files dinner",
    );
    const text = JSON.stringify(view);
    expect(text).not.toContain(fileId);
    expect(text).not.toContain(String(staffUrl));
    expect(text).not.toContain("floor-plan.pdf");

    await proof.executeCommand(
      owner,
      api.lib.clientPortalLinks.turnOffClientPortalLinks,
      { eventId: event.docId },
    );
    expect(
      await owner.query(api.clientPortal.getEvent, { token: link }),
    ).toBeNull();
    // A person without a sign-in who holds the file id gets nothing either.
    const stranger = proof.asRole({
      subject: "share-stranger",
      role: "anonymous",
      tenantId: "",
    });
    expect(await urlsFor(stranger, [fileId])).toEqual({});
  });
});

describe("runtime proof: a private chat photo stays with its message (AC-029)", () => {
  it("copying the photo's id into another message or record opens nothing", async () => {
    const t = convexTest(schema, modules);
    const TENANT = "tenant-chat-files";
    const addPerson = (subject: string) =>
      t.run(async (ctx) =>
        ctx.db.insert("people", {
          tenantId: TENANT,
          givenName: "Pat",
          familyName: subject,
          email: subject + "@example.test",
          role: "kitchen_staff",
          employmentType: "full_time",
          status: "active",
          authSubjectId: subject,
          version: 1,
        }),
      );
    const sender = await addPerson("chat-sender");
    const recipient = await addPerson("chat-recipient");
    const snoop = await addPerson("chat-snoop");
    const as = (subject: string) =>
      t.withIdentity({ subject, org_id: TENANT, role: "kitchen_staff" });

    const photoId = (await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["private-photo-bytes"])),
    )) as Id<"_storage">;
    await as("chat-sender").mutation(api.teamChatSend.sendWithFiles, {
      recipientPersonId: String(recipient),
      body: "Just for you",
      files: [
        {
          storageId: photoId,
          fileName: "private.jpg",
          contentType: "image/jpeg",
          fileSize: 19,
        },
      ],
      idempotencyKey: "private-photo",
      sender: { tenantId: TENANT, personId: String(sender) },
    });

    const thread = (await as("chat-recipient").query(api.teamChat.listChannel, {
      otherPersonId: String(sender),
      since: 0,
    })) as { messages: Array<{ attachments: Array<{ url: string | null }> }> };
    expect(thread.messages[0]?.attachments[0]?.url).toMatch(/^https?:\/\//);

    // Another teammate who learns the id cannot send it as their own file.
    await expect(
      as("chat-snoop").mutation(api.teamChatSend.sendWithFiles, {
        recipientPersonId: String(sender),
        body: "Look what I found",
        files: [
          {
            storageId: photoId,
            fileName: "copied.jpg",
            contentType: "image/jpeg",
            fileSize: 19,
          },
        ],
        idempotencyKey: "copied-photo",
        sender: { tenantId: TENANT, personId: String(snoop) },
      }),
    ).rejects.toThrow(/already used somewhere else/);

    // Nor open it by linking the id to a workspace record.
    await t.run(async (ctx) => {
      await ctx.db.insert("attachments", {
        tenantId: TENANT,
        parentType: "eventRecord",
        parentId: "evt-chat-files",
        fileName: "copied.jpg",
        contentType: "image/jpeg",
        fileSize: 19,
        storageId: photoId,
        uploadedById: "chat-snoop",
        uploadedAt: Date.now(),
        version: 1,
      });
    });
    const urls = (await as("chat-snoop").query(
      api.fileStorage.urlsForStorageIds,
      { storageIds: [photoId] },
    )) as Record<string, string | null>;
    expect(urls[photoId]).toBeNull();
    const listed = (await as("chat-snoop").query(
      api.fileStorage.listForParent,
      {
        parentType: "eventRecord",
        parentId: "evt-chat-files",
      },
    )) as Array<{ url: string | null }>;
    expect(listed[0]?.url).toBeNull();
  });
});
