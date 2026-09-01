import { useConvex, useMutation, useQuery } from "convex/react";
import { useCallback, useMemo } from "react";
import { api } from "../../lib/api";
import {
  useAttachmentRemove,
  useCreateAttachment,
  useCreateStaffMessage,
  useListPerson,
  useStaffMessageEdit,
  useStaffMessageMarkRead,
  useStaffMessageRemove,
} from "../../lib/manifest-convex-react";
import { useAuthStatus } from "../../lib/useAuthStatus";
import type { ChatComposerSubmit } from "./ChatComposer";
import {
  CHAT_RETENTION_MS,
  type ChatChannel,
  type ChatLinkTarget,
  type ChatMessageView,
} from "./chatTypes";

/**
 * Backend wiring for the chat surfaces. Lives here, not in workforce/ or
 * events/: those feature roots may not construct Convex hooks directly
 * (integration guards), the same reason attachments/useParentPhotos exists.
 */

const HOUR_MS = 3_600_000;
// Roles carrying manageAccess (base.manifest: manager and every *_manager,
// admin → owner → system). Managers may remove any channel message.
const MANAGE_ROLES = new Set(["manager", "admin", "owner", "system"]);

/** Clock inputs for the seam, rounded so query args stay stable per mount. */
function useChatClock() {
  return useMemo(() => {
    const now = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
    return { now, since: now - CHAT_RETENTION_MS };
  }, []);
}

export function personDisplayName(person: {
  givenName?: string | null;
  familyName?: string | null;
}): string {
  return `${person.givenName ?? ""} ${person.familyName ?? ""}`.trim();
}

/** Who the signed-in user is in chat terms, plus the roster for names. */
export function useChatIdentity() {
  const status = useAuthStatus();
  const people = useListPerson();
  return useMemo(() => {
    const personId = status?.personId ?? null;
    const role = status?.role ?? "";
    const roster = (people ?? []).filter((person) => person.deletedAt == null);
    const me = personId
      ? (roster.find((person) => person._id === personId) ?? null)
      : null;
    const names = new Map<string, string>();
    for (const person of people ?? []) {
      names.set(String(person._id), personDisplayName(person) || "Teammate");
    }
    return {
      loading: status === undefined || people === undefined,
      personId,
      me,
      canManage: MANAGE_ROLES.has(role) || role.endsWith("_manager"),
      roster,
      names,
    };
  }, [status, people]);
}

/** The conversation rail: DM partners and event channels with unread counts. */
export function useChatConversations(enabled = true) {
  const { now, since } = useChatClock();
  return useQuery(
    api.teamChat.listConversations,
    enabled ? { since, now } : "skip",
  );
}

/** One thread; undefined while loading, null when not readable. */
export function useChatChannel(channel: ChatChannel | null) {
  const { since } = useChatClock();
  const args =
    channel == null
      ? ("skip" as const)
      : channel.kind === "event"
        ? { eventId: channel.eventId, since }
        : { otherPersonId: channel.personId, since };
  return useQuery(api.teamChat.listChannel, args);
}

/** Header/card facts for one event channel (same window as the thread). */
export function useChatChannelSummary(eventId: string | null) {
  const { since } = useChatClock();
  return useQuery(
    api.teamChat.channelSummary,
    eventId ? { eventId, since } : ("skip" as const),
  );
}

/** Promise-based record search for the composer's `#` picker. */
export function useChatRecordSearch(): (
  term: string,
) => Promise<readonly ChatLinkTarget[]> {
  const convex = useConvex();
  return useCallback(
    async (term: string) => {
      try {
        return await convex.query(api.teamChat.searchLinkTargets, { term });
      } catch {
        return [];
      }
    },
    [convex],
  );
}

type UploadedFile = { file: File; storageId: string };

/**
 * Upload every file, create the message, then attach the files to it.
 * Uploads run first so a failed upload never leaves a half message behind.
 * If any attach fails, the rows that did attach and the message are taken
 * back and the send rejects, so the composer restores the draft for a clean
 * retry. Only when that rollback itself fails does the call resolve — with a
 * warning naming the files the sent message is missing — because the
 * message is then really there and a restored draft would duplicate it.
 */
export function useSendChatMessage() {
  const generateUploadUrl = useMutation(api.fileStorage.generateUploadUrl);
  const send = useCreateStaffMessage();
  const attach = useCreateAttachment();
  const removeAttachment = useAttachmentRemove();
  const remove = useStaffMessageRemove();

  return useCallback(
    async (
      channel: ChatChannel,
      submit: ChatComposerSubmit,
    ): Promise<string | null> => {
      const uploaded: UploadedFile[] = [];
      for (const file of submit.files) {
        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!response.ok) {
          throw new Error(
            `Upload of ${file.name} failed (${response.status}). Nothing was sent.`,
          );
        }
        const { storageId } = (await response.json()) as { storageId: string };
        uploaded.push({ file, storageId });
      }

      // The server copies the recipient's sign-in from the Person row itself.
      const target =
        channel.kind === "event"
          ? { eventId: channel.eventId }
          : { recipientPersonId: channel.personId };
      const result = (await send({
        ...target,
        body: submit.body,
        attachmentCount: uploaded.length,
        ...(submit.mentionedPersonIds.length > 0
          ? { mentionedPersonIds: submit.mentionedPersonIds.join(",") }
          : {}),
      })) as { docId?: string } | null;
      const docId = result?.docId;
      if (!docId) throw new Error("The message was not created.");

      const failed: string[] = [];
      const attached: string[] = [];
      for (const { file, storageId } of uploaded) {
        try {
          const row = (await attach({
            parentType: "staffMessage",
            parentId: docId,
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            fileSize: file.size,
            storageId,
            idempotencyKey: `${docId}:${storageId}`,
          })) as { docId?: string } | null;
          if (row?.docId) attached.push(row.docId);
        } catch {
          failed.push(file.name);
        }
      }
      if (failed.length === 0) return null;

      // Roll back the message FIRST. If that fails the message stays, so its
      // successful files must stay with it; only after the message is gone
      // are its orphaned attachment rows tidied (best effort).
      const files = `${failed.length === 1 ? "a file" : `${failed.length} files`} (${failed.join(", ")})`;
      try {
        await remove({ docId });
      } catch {
        return `The message was sent without ${files}. Attach ${
          failed.length === 1 ? "it" : "them"
        } again in a new message.`;
      }
      await Promise.all(
        attached.map((attachmentId) =>
          removeAttachment({ docId: attachmentId }).catch(() => undefined),
        ),
      );
      throw new Error(
        `Could not attach ${files}, so nothing was sent. Try again.`,
      );
    },
    [attach, generateUploadUrl, remove, removeAttachment, send],
  );
}

/** Edit and remove for one message (guards run server-side). */
export function useChatMessageActions() {
  const edit = useStaffMessageEdit();
  const remove = useStaffMessageRemove();
  return useMemo(
    () => ({
      edit: async (message: ChatMessageView, body: string) => {
        await edit({ docId: message._id, version: message.version, body });
      },
      remove: async (message: ChatMessageView) => {
        await remove({ docId: message._id, version: message.version });
      },
    }),
    [edit, remove],
  );
}

/**
 * Move the caller's read cursor for a channel up to `readUpTo` — the
 * position of the newest message the reader actually saw, so a message that
 * lands between render and this call stays unread. One upsert on the server
 * (convex/teamChatCursor.ts): it advances the caller's single row, never
 * backwards, and folds duplicates. Best effort.
 */
export function useChatReadCursor() {
  const markChannelRead = useMutation(api.teamChatCursor.markChannelRead);
  return useCallback(
    async (channelKey: string, readUpTo: number): Promise<void> => {
      try {
        await markChannelRead({ channelKey, readUpTo });
      } catch {
        // Read state is a convenience; the thread itself already rendered.
      }
    },
    [markChannelRead],
  );
}

/** Clear the unread marker on direct messages addressed to me. Best effort. */
export function useMarkDirectRead() {
  const markRead = useStaffMessageMarkRead();
  return useCallback(
    (messages: readonly ChatMessageView[], myPersonId: string | null) => {
      if (!myPersonId) return;
      for (const message of messages) {
        if (
          message.recipientPersonId === myPersonId &&
          message.readAt == null
        ) {
          void markRead({ docId: message._id, version: message.version }).catch(
            () => {
              // Read receipts are best-effort.
            },
          );
        }
      }
    },
    [markRead],
  );
}
