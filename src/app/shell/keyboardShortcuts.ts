/** Keyboard shortcut catalog — single source of truth for the reference
 * overlay. The literal token "Mod" expands to ⌘ on macOS and Ctrl elsewhere at
 * render time so the same data drives both platforms. */

export interface KeyboardShortcut {
  id: string;
  label: string;
  description?: string;
  /** Key tokens, left to right. "Mod" becomes ⌘ / Ctrl. Empty = text-only. */
  keys: string[];
}

export interface ShortcutGroup {
  group: string;
  shortcuts: KeyboardShortcut[];
}

export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

export function modLabel(): string {
  return isMac ? "⌘" : "Ctrl";
}

export function displayKeys(keys: string[]): string[] {
  return keys.map((k) => (k === "Mod" ? modLabel() : k));
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    group: "Global",
    shortcuts: [
      {
        id: "palette",
        label: "Open search",
        description:
          "Jump to any section, add something new, or run a quick action.",
        keys: ["Mod", "K"],
      },
      {
        id: "shortcuts",
        label: "Show keyboard shortcuts",
        description: "Open this list of shortcuts you can search.",
        keys: ["?"],
      },
      {
        id: "escape",
        label: "Close dialog or overlay",
        description: "Dismiss search, this overlay, or any open dialog.",
        keys: ["Esc"],
      },
    ],
  },
  {
    group: "Search",
    shortcuts: [
      {
        id: "palette-up",
        label: "Move selection up",
        keys: ["↑"],
      },
      {
        id: "palette-down",
        label: "Move selection down",
        keys: ["↓"],
      },
      {
        id: "palette-enter",
        label: "Open the highlighted result",
        description: "Open the highlighted result or run its action.",
        keys: ["Enter"],
      },
      {
        id: "palette-search",
        label: "Search as you type",
        description:
          "Filter sections and items, or type a plain question (e.g. “unpaid invoices over 30 days”).",
        keys: [],
      },
    ],
  },
];
