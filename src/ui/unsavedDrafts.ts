// PL-STALE-ASSETS (AC-166): every open form with unsaved edits registers a
// "save now" callback here, so a reload for a new Capsule version can write
// each draft to this browser first. After the reload the form offers the
// draft back (src/ui/formDraft.tsx DraftRestoreBanner).

const savers = new Set<() => void>();

/** Register a form's save-now callback; returns the unregister call. */
export function registerUnsavedDraft(save: () => void): () => void {
  savers.add(save);
  return () => {
    savers.delete(save);
  };
}

export function hasUnsavedDrafts(): boolean {
  return savers.size > 0;
}

/**
 * Write every unsaved draft to this browser now. Each saver also drops its
 * "leave page?" guard, because the draft is safe once written.
 */
export function saveUnsavedDrafts(): void {
  for (const save of [...savers]) {
    try {
      save();
    } catch {
      // one broken form must not stop the others from saving
    }
  }
}

/** Save every draft, then load the newest Capsule. */
export function reloadKeepingDrafts(): void {
  saveUnsavedDrafts();
  window.location.reload();
}
