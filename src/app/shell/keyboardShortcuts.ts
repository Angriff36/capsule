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
        label: "Open command palette",
        description:
          "Jump to any section, create a record, or trigger a common action.",
        keys: ["Mod", "K"],
      },
      {
        id: "shortcuts",
        label: "Show keyboard shortcuts",
        description: "Open this searchable reference overlay.",
        keys: ["?"],
      },
      {
        id: "escape",
        label: "Close dialog or overlay",
        description: "Dismiss the palette, this overlay, or any open dialog.",
        keys: ["Esc"],
      },
    ],
  },
  {
    group: "Command palette",
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
        label: "Run selected command",
        description: "Open the highlighted result or trigger its action.",
        keys: ["Enter"],
      },
      {
        id: "palette-search",
        label: "Search as you type",
        description:
          "Filter sections and records, or ask in natural language (e.g. “unpaid invoices over 30 days”).",
        keys: [],
      },
    ],
  },
];
