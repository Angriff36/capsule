/**
 * View types returned by the authored team-chat seam (convex/teamChat.ts).
 * The seam projects StaffMessage rows plus their Attachment rows into these
 * shapes; nothing here carries auth subject ids or HR fields.
 */

export type ChatAttachmentView = {
  readonly _id: string;
  readonly version: number;
  readonly fileName: string;
  readonly contentType: string;
  readonly fileSize: number;
  /** Signed download URL, or null when the stored file is gone. */
  readonly url: string | null;
};

export type ChatMessageView = {
  readonly _id: string;
  readonly version: number;
  readonly senderPersonId: string;
  readonly recipientPersonId: string | null;
  readonly eventId: string | null;
  /** Decrypted body with `[[kind:id|Label]]` record tokens. */
  readonly body: string;
  readonly createdAt: number;
  readonly editedAt: number | null;
  readonly readAt: number | null;
  readonly attachments: readonly ChatAttachmentView[];
};

/** One direct-message partner in the conversation rail. */
export type ChatDirectConversation = {
  readonly personId: string;
  readonly lastAt: number;
  readonly unread: number;
  readonly preview: string;
};

/** One event channel in the conversation rail. */
export type ChatEventConversation = {
  readonly eventId: string;
  readonly title: string;
  readonly startsAt: number | null;
  readonly stage: string;
  readonly lastAt: number | null;
  readonly unread: number;
  /** True when more than the scanned window is unread ("50+"). */
  readonly unreadCapped: boolean;
  readonly preview: string;
  /** The caller's read-cursor row for this channel, if one exists. */
  readonly myCursorId: string | null;
  readonly lastReadAt: number | null;
};

export type ChatConversations = {
  readonly direct: readonly ChatDirectConversation[];
  readonly events: readonly ChatEventConversation[];
};

/** Compact facts about one event channel (tab header, phone card). */
export type ChatChannelSummary = {
  readonly count: number;
  readonly countCapped: boolean;
  readonly lastAt: number | null;
  readonly preview: string;
  readonly unread: number;
  readonly myCursorId: string | null;
  readonly lastReadAt: number | null;
};

/** A record the composer can link to (`#` picker). */
export type ChatLinkTarget = {
  readonly kind: string;
  readonly id: string;
  readonly label: string;
  readonly hint: string;
};

/** Which thread the chat surface is showing. */
export type ChatChannel =
  | { readonly kind: "direct"; readonly personId: string }
  | { readonly kind: "event"; readonly eventId: string };

export function chatChannelKey(channel: ChatChannel): string {
  return channel.kind === "event"
    ? `event:${channel.eventId}`
    : `dm:${channel.personId}`;
}

/** Messages older than this drop out of the UI — 90-day retention window. */
export const CHAT_RETENTION_MS = 90 * 86_400_000;

/** Files per message. The chat seam hydrates at most 50 rows per message (convex/lib/teamChatRead.ts ATTACHMENT_SCAN). */
export const CHAT_MAX_FILES = 20;

/** The guard message the send command raises for an unlinked sign-in. */
export const CHAT_UNLINKED_REASON =
  "Link your account to a staff profile before sending messages";

/**
 * Who is sending: the tenant and current linked Person at the moment Send
 * was pressed. Travels with the send (and with an unsent draft) so the
 * server commits only if the signed-in identity is still this one.
 */
export type ChatSender = {
  readonly tenantId: string;
  readonly personId: string;
};

export const chatSenderKey = (sender: ChatSender): string =>
  `${sender.tenantId}:${sender.personId}`;
