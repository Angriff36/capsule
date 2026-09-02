/**
 * Caret helpers for the composer's `@` and `#` triggers. Pure functions so
 * the picker rules stay readable apart from the React state around them.
 */

export type ChatCaretTrigger = {
  readonly char: "@" | "#";
  /** Index of the trigger character in the text. */
  readonly start: number;
  /** Caret position — the end of the fragment. */
  readonly end: number;
  /** Text typed after the trigger, without trailing whitespace. */
  readonly fragment: string;
};

/** `@` or `#` at the start of the text or after whitespace, then up to three
 *  words, ending exactly at the caret. A trailing space closes the trigger,
 *  so `ryan@example.com` and `@Ana Lopez ` never open a picker. */
const TRIGGER = /(?:^|\s)([@#])([^\s@#](?:[^@#\n]*[^\s@#])?)?$/;
const MAX_WORDS = 3;

export function chatTriggerAtCaret(
  value: string,
  caret: number,
): ChatCaretTrigger | null {
  const match = TRIGGER.exec(value.slice(0, caret));
  if (!match) return null;
  const fragment = match[2] ?? "";
  if (fragment.split(/\s+/).length > MAX_WORDS) return null;
  return {
    char: match[1] === "@" ? "@" : "#",
    start: caret - fragment.length - 1,
    end: caret,
    fragment,
  };
}

/** Replace `[start, end)` with `insert`; the caret lands after the insert. */
export function chatSpliceText(
  value: string,
  start: number,
  end: number,
  insert: string,
): { readonly value: string; readonly caret: number } {
  return {
    value: value.slice(0, start) + insert + value.slice(end),
    caret: start + insert.length,
  };
}

/** Case-insensitive match on the start of the name or the start of any word. */
export function chatPersonMatches(name: string, fragment: string): boolean {
  const needle = fragment.trim().toLowerCase();
  if (needle.length === 0) return true;
  const haystack = name.toLowerCase();
  return (
    haystack.startsWith(needle) ||
    haystack.split(/\s+/).some((word) => word.startsWith(needle))
  );
}
