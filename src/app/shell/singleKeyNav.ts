/** Global single-key shortcuts (letter nav, `?`) must not steal keys from
 * text fields. Event menu recipe search is `type="search"` — still an INPUT. */

export type ShortcutTargetLike = {
  tagName?: string;
  isContentEditable?: boolean;
};

export type SingleKeyNavEvent = {
  key: string;
  target?: ShortcutTargetLike | EventTarget | null;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
};

/** True when the key originated in a field that should keep typed characters. */
export function isEditableShortcutTarget(
  target: ShortcutTargetLike | EventTarget | null | undefined,
): boolean {
  if (target == null || typeof target !== "object") return false;
  const el = target as ShortcutTargetLike;
  const tag = String(el.tagName ?? "").toUpperCase();
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true
  );
}

/** Bare character keys (i/k/c/…) and `?` that would fire single-key nav. */
export function isSingleKeyNavKey(event: SingleKeyNavEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return event.key.length === 1;
}

/** Whether the global single-key nav listener should act on this keydown. */
export function shouldFireSingleKeyNav(event: SingleKeyNavEvent): boolean {
  if (!isSingleKeyNavKey(event)) return false;
  if (isEditableShortcutTarget(event.target)) return false;
  return true;
}

/** Stop the key from bubbling to the window single-key nav listener. */
export function trapSingleKeyNav(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}
