import type { ChatComposerLink, ChatComposerPerson } from "./chatComposerTypes";
import type { ChatPendingFile } from "./ChatComposerChips";

/** What the composer held when Send was pressed. */
export type ChatComposerDraft = {
  readonly text: string;
  readonly files: readonly ChatPendingFile[];
  readonly links: readonly ChatComposerLink[];
  readonly mentions: readonly ChatComposerPerson[];
};

/**
 * A failed send puts its draft back in FRONT of whatever the user typed or
 * attached while it was in flight, so nothing is lost and nothing doubles.
 */
export function restoreDraftText(failed: string, current: string): string {
  return current.trim().length > 0 ? `${failed.trimEnd()}\n${current}` : failed;
}

export function restoreDraftFiles(
  failed: readonly ChatPendingFile[],
  current: readonly ChatPendingFile[],
): ChatPendingFile[] {
  return [...failed, ...current];
}

export function restoreDraftLinks(
  failed: readonly ChatComposerLink[],
  current: readonly ChatComposerLink[],
): ChatComposerLink[] {
  return [
    ...failed,
    ...current.filter(
      (item) =>
        !failed.some((link) => link.kind === item.kind && link.id === item.id),
    ),
  ];
}

export function restoreDraftMentions(
  failed: readonly ChatComposerPerson[],
  current: readonly ChatComposerPerson[],
): ChatComposerPerson[] {
  return [
    ...failed,
    ...current.filter(
      (item) => !failed.some((mention) => mention.personId === item.personId),
    ),
  ];
}
