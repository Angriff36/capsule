import { useCallback, useSyncExternalStore } from "react";

/**
 * How team chat looks for THIS person on THIS browser — like the dark-mode
 * toggle, a device preference, not a server setting. Layout: the ruled rows
 * every screen ships with, or iPhone-like bubbles. Accent: the fill of your
 * own bubbles only (the crew's stay neutral), so a thread never turns into a
 * rainbow.
 */
export type ChatLayout = "rows" | "bubbles";
export type ChatAccent =
  "blue" | "graphite" | "orange" | "green" | "plum" | "teal";

export type ChatAppearance = {
  readonly layout: ChatLayout;
  readonly accent: ChatAccent;
};

export const CHAT_LAYOUTS: readonly { key: ChatLayout; label: string }[] = [
  { key: "rows", label: "Rows" },
  { key: "bubbles", label: "Bubbles" },
];

export const CHAT_ACCENTS: readonly { key: ChatAccent; label: string }[] = [
  { key: "blue", label: "Blue" },
  { key: "graphite", label: "Graphite" },
  { key: "orange", label: "Orange" },
  { key: "green", label: "Green" },
  { key: "plum", label: "Plum" },
  { key: "teal", label: "Teal" },
];

export const CHAT_APPEARANCE_DEFAULT: ChatAppearance = {
  layout: "rows",
  accent: "blue",
};

const STORAGE_KEY = "capsule-chat-appearance";
const CHANGE_EVENT = "capsule-chat-appearance";

const LAYOUTS = new Set<string>(CHAT_LAYOUTS.map((item) => item.key));
const ACCENTS = new Set<string>(CHAT_ACCENTS.map((item) => item.key));

function read(): ChatAppearance {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return CHAT_APPEARANCE_DEFAULT;
    const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>;
    const layout = parsed.layout;
    const accent = parsed.accent;
    return {
      layout:
        typeof layout === "string" && LAYOUTS.has(layout)
          ? (layout as ChatLayout)
          : CHAT_APPEARANCE_DEFAULT.layout,
      accent:
        typeof accent === "string" && ACCENTS.has(accent)
          ? (accent as ChatAccent)
          : CHAT_APPEARANCE_DEFAULT.accent,
    };
  } catch {
    return CHAT_APPEARANCE_DEFAULT;
  }
}

let snapshot: ChatAppearance | null = null;

function current(): ChatAppearance {
  if (snapshot === null) snapshot = read();
  return snapshot;
}

function write(next: ChatAppearance): void {
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private window or storage blocked: the choice lasts for this page.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) {
      snapshot = read();
      listener();
    }
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useChatAppearance() {
  const appearance = useSyncExternalStore(
    subscribe,
    current,
    () => CHAT_APPEARANCE_DEFAULT,
  );
  const set = useCallback((patch: Partial<ChatAppearance>) => {
    write({ ...current(), ...patch });
  }, []);
  const reset = useCallback(() => write(CHAT_APPEARANCE_DEFAULT), []);
  return { ...appearance, set, reset };
}
