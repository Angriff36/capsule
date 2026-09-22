/**
 * The source-evidence link the Event itself owns: the import source key the
 * operator stored on the Event at capture time (via captureDraft /
 * updateImportDraft). A later live source file name must NOT stand in for it —
 * a missing stored key stays missing (null), never falls back to the live
 * file name. The file name is still shown in the Source files list; this is
 * only the stored link.
 */
export function eventSourceEvidenceKey(input: {
  storedKey?: string | null;
  liveFileName?: string | null;
}): string | null {
  const stored = input.storedKey?.trim();
  if (!stored) return null;
  return stored;
}
