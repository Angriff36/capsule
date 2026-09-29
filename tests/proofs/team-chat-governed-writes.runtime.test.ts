/**
 * Runtime proof (governed writes, 2026-09-29): team chat's authored seams
 * change data only through generated commands.
 *
 * - convex/chatNotifyPreference.ts `set` → ChatNotifyPreference.create /
 *   setEnabled (one row per account, owner-only).
 * - convex/teamChatCursor.ts `markChannelRead` → StaffChatReadCursor.open /
 *   touch (one row per channel and account, never backwards).
 * - convex/teamChatSend.ts `sendWithFiles` → Attachment.attach for chat files
 *   and StaffMessage.recordAttachments for the count and the file-only body.
 */
import { convexTest } from "convex-test";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";
import { ensureTestFieldEncryptionKey } from "./test-field-encryption-key";

beforeAll(ensureTestFieldEncryptionKey);

const TENANT = "tenant-chat-governed";

function harness() {
  const t = convexTest(schema, modules);
  const proof = createManifestTestContext({
    convexTest: (() => t) as never,
    schema,
    modules,
  });
  return { t, proof };
}
type Harness = ReturnType<typeof harness>;

async function addStaff(
  { t }: Harness,
  subject: string,
): Promise<Id<"people">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("people", {
      tenantId: TENANT,
      givenName: "Pat",
      familyName: subject,
      email: `${subject}@example.test`,
      role: "kitchen_staff",
      employmentType: "full_time",
      status: "active",
      authSubjectId: subject,
      version: 1,
    }),
  );
}

const as = (h: Harness, subject: string) =>
  h.proof.asRole({ subject, role: "kitchen_staff", tenantId: TENANT });

async function table<T extends "chatNotifyPreferences" | "staffChatReadCursors" | "attachments" | "staffMessages">(
  { t }: Harness,
  name: T,
) {
  return await t.run(async (ctx) => ctx.db.query(name).collect());
}

async function eventTypes({ t }: Harness): Promise<string[]> {
  return await t.run(async (ctx) =>
    (await ctx.db.query("manifestEvents").collect()).map((row) => row.type),
  );
}

describe("chat notification preference", () => {
  it("set creates the account's one row, then changes it through setEnabled", async () => {
    const h = harness();
    await addStaff(h, "cook");
    const cook = as(h, "cook");

    await cook.mutation(api.chatNotifyPreference.set, { enabled: true });
    await cook.mutation(api.chatNotifyPreference.set, { enabled: true });
    await cook.mutation(api.chatNotifyPreference.set, { enabled: false });

    const rows = await table(h, "chatNotifyPreferences");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ownerId: "cook", enabled: false });
    expect(await cook.query(api.chatNotifyPreference.mine, {})).toBe(false);
    expect(
      (await eventTypes(h)).filter((type) => type === "ChatNotifyPreferenceSet"),
    ).toHaveLength(2);
  });

  it("only the owner changes a preference, one row per account, never anonymous", async () => {
    const h = harness();
    await addStaff(h, "cook");
    await addStaff(h, "server");
    await as(h, "cook").mutation(api.chatNotifyPreference.set, {
      enabled: true,
    });
    const [row] = await table(h, "chatNotifyPreferences");

    await expect(
      as(h, "server").mutation(api.mutations.ChatNotifyPreference_setEnabled, {
        docId: row!._id,
        enabled: false,
      }),
    ).rejects.toThrow(/own chat notification preference/);
    await expect(
      as(h, "cook").mutation(api.mutations.ChatNotifyPreference_create, {
        enabled: false,
      }),
    ).rejects.toThrow(/already exists/);
    await expect(
      h.t.mutation(api.chatNotifyPreference.set, { enabled: true }),
    ).rejects.toThrow(/Sign in/);
    await expect(
      h.t.mutation(api.mutations.ChatNotifyPreference_create, {
        enabled: true,
      }),
    ).rejects.toThrow(/Sign in/);
    expect(await table(h, "chatNotifyPreferences")).toHaveLength(1);
  });
});

describe("chat read cursor", () => {
  it("markChannelRead opens one cursor, moves it forward, never back", async () => {
    const h = harness();
    await addStaff(h, "cook");
    const cook = as(h, "cook");
    const readUpTo = Date.now() - 10_000;

    const first = (await cook.mutation(api.teamChatCursor.markChannelRead, {
      channelKey: "event:abc",
      readUpTo,
    })) as { cursorId: string; lastReadAt: number };
    const back = (await cook.mutation(api.teamChatCursor.markChannelRead, {
      channelKey: "event:abc",
      readUpTo: readUpTo - 5_000,
    })) as { cursorId: string; lastReadAt: number };
    const forward = (await cook.mutation(api.teamChatCursor.markChannelRead, {
      channelKey: "event:abc",
      readUpTo: readUpTo + 5_000,
    })) as { cursorId: string; lastReadAt: number };

    expect(back).toEqual({ cursorId: first.cursorId, lastReadAt: readUpTo });
    expect(forward).toEqual({
      cursorId: first.cursorId,
      lastReadAt: readUpTo + 5_000,
    });
    const rows = await table(h, "staffChatReadCursors");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      authSubjectId: "cook",
      lastReadAt: readUpTo + 5_000,
      version: 2,
    });
    expect(
      (await eventTypes(h)).filter((type) => type === "StaffChatChannelRead"),
    ).toHaveLength(2);
  });

  it("a second cursor for the same channel and account is refused; another account's is untouchable", async () => {
    const h = harness();
    await addStaff(h, "cook");
    await addStaff(h, "server");
    const readUpTo = Date.now() - 10_000;
    const { cursorId } = (await as(h, "cook").mutation(
      api.teamChatCursor.markChannelRead,
      { channelKey: "event:abc", readUpTo },
    )) as { cursorId: string };

    await expect(
      as(h, "cook").mutation(api.mutations.StaffChatReadCursor_createViaOpen, {
        channelKey: "event:abc",
        readUpTo,
      }),
    ).rejects.toThrow(/already set/);
    await expect(
      as(h, "server").mutation(api.mutations.StaffChatReadCursor_touch, {
        docId: cursorId as Id<"staffChatReadCursors">,
        readUpTo,
      }),
    ).rejects.toThrow(/how far they have gotten/);
    expect(await table(h, "staffChatReadCursors")).toHaveLength(1);
  });
});

async function upload({ t }: Harness, text: string): Promise<string> {
  return await t.run(async (ctx) =>
    String(await ctx.storage.store(new Blob([text]))),
  );
}

describe("chat files", () => {
  it("a file-only message attaches its files through Attachment.attach and records them", async () => {
    const h = harness();
    const sender = await addStaff(h, "cook");
    const recipient = await addStaff(h, "server");
    const storageId = await upload(h, "photo bytes");
    const send = () =>
      as(h, "cook").mutation(api.teamChatSend.sendWithFiles, {
        recipientPersonId: String(recipient),
        body: "",
        files: [
          {
            storageId,
            fileName: "walk-in.jpg",
            contentType: "image/jpeg",
            fileSize: 11,
          },
        ],
        idempotencyKey: "draft-files",
        sender: { tenantId: TENANT, personId: String(sender) },
      }) as Promise<{ docId: string }>;

    const first = await send();
    const replay = await send();

    expect(replay.docId).toBe(first.docId);
    const files = await table(h, "attachments");
    expect(files).toEqual([
      expect.objectContaining({
        parentType: "staffMessage",
        parentId: first.docId,
        uploadedById: "cook",
        storageId,
        version: 1,
      }),
    ]);
    const [message] = await table(h, "staffMessages");
    expect(message).toMatchObject({ attachmentCount: 1, version: 2 });
    const view = (await as(h, "server").query(api.teamChat.listChannel, {
      otherPersonId: String(sender),
      since: 0,
    })) as { messages: { body: string; attachments: unknown[] }[] } | null;
    expect(view?.messages).toEqual([
      expect.objectContaining({
        body: "",
        attachments: [expect.objectContaining({ fileName: "walk-in.jpg" })],
      }),
    ]);
    const types = await eventTypes(h);
    expect(types.filter((type) => type === "AttachmentAdded")).toHaveLength(1);
    expect(types.filter((type) => type === "StaffMessageSent")).toHaveLength(1);
  });

  it("a direct call cannot put a file on someone else's message or claim files a message lacks", async () => {
    const h = harness();
    const sender = await addStaff(h, "cook");
    const recipient = await addStaff(h, "server");
    const { docId } = (await as(h, "cook").mutation(
      api.teamChatSend.sendWithFiles,
      {
        recipientPersonId: String(recipient),
        body: "Ice is in the walk-in",
        files: [],
        idempotencyKey: "draft-text",
        sender: { tenantId: TENANT, personId: String(sender) },
      },
    )) as { docId: string };
    const storageId = await upload(h, "other bytes");

    await expect(
      as(h, "server").mutation(api.mutations.Attachment_createViaAttach, {
        parentType: "staffMessage",
        parentId: docId,
        fileName: "x.jpg",
        contentType: "image/jpeg",
        fileSize: 1,
        storageId,
      }),
    ).rejects.toThrow(/attached through their message/);
    await expect(
      as(h, "cook").mutation(api.mutations.StaffMessage_recordAttachments, {
        docId: docId as Id<"staffMessages">,
        attachmentCount: 3,
        clearBody: true,
      }),
    ).rejects.toThrow(/files changed/);
    await expect(
      as(h, "server").mutation(api.mutations.StaffMessage_recordAttachments, {
        docId: docId as Id<"staffMessages">,
        attachmentCount: 0,
        clearBody: false,
      }),
    ).rejects.toThrow(/Guard 2 failed/);
    expect(await table(h, "attachments")).toEqual([]);
    const [message] = await table(h, "staffMessages");
    expect(message).toMatchObject({ attachmentCount: 0, version: 1 });
  });
});
