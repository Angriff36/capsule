import type { ChatComposerDraft } from "./chatComposerDraft";
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

export type ChatComposerSubmit = {
  /** Trimmed text followed by one `[[kind:id|Label]]` token per linked record (space separated). Empty string allowed when files exist. */
  readonly body: string;
  readonly files: readonly File[];
  readonly mentionedPersonIds: readonly string[];
  /** The raw draft, so a caller can keep it if the composer unmounts before a failure. */
  readonly draft: ChatComposerDraft;
  /** Stable for this draft across retries; the server de-duplicates on it. */
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
  readonly onSubmit: (submit: ChatComposerSubmit) => Promise<void>;
  readonly sending: boolean;
  /** Upload/send error from the caller; render as `role="alert"` text-sm text-danger above the toolbar. */
  readonly error: string | null;
  /** Optional: increments when the caller wants the textarea focused (e.g. after channel switch on desktop). */
  readonly focusSignal?: number;
  /** A draft to start from — a send that failed after this channel was left. Read once, on mount. */
  readonly initialDraft?: ChatComposerDraft | null;
  /** Called once on mount when `initialDraft` was taken in, so the caller can drop its copy. */
  readonly onInitialDraftConsumed?: () => void;
  /** A failed draft to merge into the live composer (same channel re-opened before the failure). */
  readonly restoreDraft?: {
    readonly draft: ChatComposerDraft;
    readonly token: number;
  } | null;
  readonly onRestoreConsumed?: (token: number) => void;
  /** A send failed after this composer unmounted; the caller keeps the draft. */
  readonly onDraftOrphaned?: (draft: ChatComposerDraft) => void;
};
