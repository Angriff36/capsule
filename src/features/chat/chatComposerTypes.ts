import type { ChatPendingFile } from "./ChatComposerChips";
import type { ChatLinkKind } from "./chatLinkTokens";
import type { ChatLinkTarget } from "./chatTypes";

export type ChatComposerLink = {
  readonly kind: ChatLinkKind;
  readonly id: string;
  readonly label: string;
};

export type ChatComposerPerson = {
  readonly personId: string;
  readonly name: string;
};

/**
 * What the composer held when Send was pressed. Kept with a message that did
 * not send so it can be shown and retried as-is; never merged back into the
 * composer.
 */
export type ChatComposerDraft = {
  readonly text: string;
  readonly files: readonly ChatPendingFile[];
  readonly links: readonly ChatComposerLink[];
  readonly mentions: readonly ChatComposerPerson[];
};

export type ChatComposerSubmit = {
  /** Trimmed text followed by one `[[kind:id|Label]]` token per linked record (space separated). Empty string allowed when files exist. */
  readonly body: string;
  readonly files: readonly File[];
  readonly mentionedPersonIds: readonly string[];
  /** The raw draft, for the "Not sent" row's preview. */
  readonly draft: ChatComposerDraft;
  /**
   * Minted once per draft. A retry of the same unsent message sends the same
   * key, and the server de-duplicates on it — a first attempt that committed
   * but lost its response is never sent twice.
   */
  readonly idempotencyKey: string;
};

export type ChatComposerProps = {
  readonly placeholder: string;
  /** When set, the composer is disabled and shows this line instead of the toolbar (e.g. "Link your account to a staff profile before sending messages"). */
  readonly disabledReason?: string | null;
  /** Teammates for the @ picker (already excludes the current user). */
  readonly people: readonly ChatComposerPerson[];
  /** Record search for the # picker; resolves to [] on error. Called only with terms of ≥ 2 chars, debounced 180ms by the composer. */
  readonly searchRecords: (term: string) => Promise<readonly ChatLinkTarget[]>;
  /**
   * Settles when the send is over either way. The composer clears before it
   * awaits and never restores: a failure is the caller's to keep as an unsent
   * message (see ChatUnsentDrafts), so text typed meanwhile stays the next
   * message and the failed one stays its own operation.
   */
  readonly onSubmit: (submit: ChatComposerSubmit) => Promise<void>;
  readonly sending: boolean;
  /** Optional: increments when the caller wants the textarea focused (e.g. after channel switch on desktop). */
  readonly focusSignal?: number;
};
