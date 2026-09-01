import { useConvex, useMutation, useQuery } from "convex/react";
import { useCallback, useMemo } from "react";
import { api } from "../../lib/api";
import {
  useCreateAttachment,
  useCreateStaffChatReadCursor,
  useCreateStaffMessage,
  useListPerson,
  useStaffChatReadCursorTouch,
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

/** Header/card facts for one event channel. */
export function useChatChannelSummary(eventId: string | null) {
  return useQuery(
    api.teamChat.channelSummary,
    eventId ? { eventId } : ("skip" as const),
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
 * Uploads run first so a failed upload never leaves a half message behind;
 * if every attach fails on a text-less message the message is taken back.
 * Resolves with a `warning` when the message exists but some files did not
 * attach — a rejection there would make the composer keep and re-send the
 * whole draft.
 */
export function useSendChatMessage() {
  const generateUploadUrl = useMutation(api.fileStorage.generateUploadUrl);
  const send = useCreateStaffMessage();
  const attach = useCreateAttachment();
  const remove = useStaffMessageRemove();

  return useCallback(
    async (
      channel: ChatChannel,
      submit: ChatComposerSubmit,
      recipientAuthSubjectId?: string | null,
    ): Promise<{ warning?: string }> => {
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

      const target =
        channel.kind === "event"
          ? { eventId: channel.eventId }
          : {
              recipientPersonId: channel.personId,
              ...(recipientAuthSubjectId ? { recipientAuthSubjectId } : {}),
            };
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
      for (const { file, storageId } of uploaded) {
        try {
          await attach({
            parentType: "staffMessage",
            parentId: docId,
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            fileSize: file.size,
            storageId,
            idempotencyKey: `${docId}:${storageId}`,
          });
        } catch {
          failed.push(file.name);
        }
      }
      if (failed.length === 0) return {};
      if (
        failed.length === uploaded.length &&
        submit.body.trim().length === 0
      ) {
        try {
          await remove({ docId });
        } catch {
          // The seam already hides a text-less message with no files.
        }
        throw new Error(
          `${failed.length === 1 ? "The file" : "The files"} could not be attached, so nothing was sent. Try again.`,
        );
      }
      return {
        warning: `Message sent, but ${failed.length} of ${uploaded.length} files failed to attach: ${failed.join(", ")}.`,
      };
    },
    [attach, generateUploadUrl, remove, send],
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
 * Move the caller's read cursor for a channel to now. Touches the row the
 * seam handed back; opens one only when none exists yet and returns the new
 * row id so the caller can touch it next time. Best effort.
 */
export function useChatReadCursor() {
  const open = useCreateStaffChatReadCursor();
  const touch = useStaffChatReadCursorTouch();
  return useCallback(
    async (
      channelKey: string,
      myCursorId: string | null,
    ): Promise<string | null> => {
      try {
        if (myCursorId) {
          await touch({ docId: myCursorId });
          return myCursorId;
        }
        const created = (await open({ channelKey })) as {
          docId?: string;
        } | null;
        return created?.docId ?? null;
      } catch {
        // Read state is a convenience; the thread itself already rendered.
        return myCursorId;
      }
    },
    [open, touch],
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
