/** Global single-key shortcuts (letter nav, `?`) must not steal keys from
 * text fields. Event menu recipe search is `type="search"` — still an INPUT.
 * Browser refresh chords (Ctrl/Cmd+R, Ctrl/Cmd+Shift+R, F5) are never app
 * routes.
 */

/** Plain { tagName, type } stubs in tests, plus real EventTargets. */
export type ShortcutTargetLike = {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
  role?: string;
  getAttribute?: (name: string) => string | null;
};

export type SingleKeyNavEvent = {
  key: string;
  target?: ShortcutTargetLike | EventTarget | null;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
};

/** True when the key originated in a field that should keep typed characters. */
export function isEditableShortcutTarget(
  target: ShortcutTargetLike | EventTarget | null | undefined,
): boolean {
  if (target == null || typeof target !== "object") return false;
  const el = target as ShortcutTargetLike;
  const tag = String(el.tagName ?? "").toUpperCase();
  if (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true
  ) {
    return true;
  }
  const role = String(el.role ?? el.getAttribute?.("role") ?? "").toLowerCase();
  return role === "searchbox" || role === "textbox";
}

/** Bare character keys (i/k/c/…) and `?` that would fire single-key nav. */
export function isSingleKeyNavKey(event: SingleKeyNavEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return event.key.length === 1;
}

export function isBrowserRefreshChord(event: SingleKeyNavEvent): boolean {
  const key = event.key.toLowerCase();
  if (key === "f5") return true;
  const modified = Boolean(event.ctrlKey || event.metaKey);
  return modified && key === "r";
}

/** Whether the global single-key nav listener should act on this keydown. */
export function shouldFireSingleKeyNav(event: SingleKeyNavEvent): boolean {
  if (isBrowserRefreshChord(event)) return false;
  if (!isSingleKeyNavKey(event)) return false;
  if (isEditableShortcutTarget(event.target)) return false;
  return true;
}

/** App route for a keydown, or null. Refresh chords never map to a route. */
export function appRouteForKeydown(event: SingleKeyNavEvent): string | null {
  if (isBrowserRefreshChord(event)) return null;
  if (!shouldFireSingleKeyNav(event)) return null;
  return null;
}

/** Stop the key from bubbling to the window single-key nav listener. */
export function trapSingleKeyNav(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}
