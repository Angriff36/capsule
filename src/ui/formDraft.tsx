import { useCallback, useEffect, useRef, useState } from "react";

// ponytail: uncontrolled-form draft persistence. A native delegated "input"
// listener on the <form> serializes FormData to localStorage (debounced) and
// arms a beforeunload guard while there are unsaved edits — no form library,
// no controlled state, so existing FormData submit handlers keep working.
// Client-side route changes are NOT blocked (this router isn't a data router);
// the localStorage draft is the recovery path for that case and for tab close,
// refresh, and session timeout.

const KEY_PREFIX = "capsule:draft:";
const SAVE_DEBOUNCE_MS = 600;

export type StoredDraft = { savedAt: number; values: Record<string, string> };

// Stable handler so add/removeEventListener target the same reference.
function beforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
}

function readDraft(storageKey: string): StoredDraft | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (!parsed || typeof parsed.savedAt !== "number" || !parsed.values) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function useFormDraft(key: string) {
  const storageKey = KEY_PREFIX + key;
  const [form, setForm] = useState<HTMLFormElement | null>(null);
  const [draft, setDraft] = useState<StoredDraft | null>(() =>
    readDraft(storageKey),
  );
  const armed = useRef(false);

  const arm = useCallback(() => {
    if (armed.current) return;
    armed.current = true;
    window.addEventListener("beforeunload", beforeUnload);
  }, []);

  const disarm = useCallback(() => {
    armed.current = false;
    window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  // Persist edits (debounced) and arm the unload guard while dirty.
  useEffect(() => {
    if (!form) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const persist = () => {
      const values: Record<string, string> = {};
      new FormData(form).forEach((value, name) => {
        if (typeof value === "string" && value !== "") values[name] = value;
      });
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ savedAt: Date.now(), values }),
        );
      } catch {
        // storage full or disabled — the unload guard still protects the user
      }
    };

    const onInput = () => {
      arm();
      clearTimeout(timer);
      timer = setTimeout(persist, SAVE_DEBOUNCE_MS);
    };

    form.addEventListener("input", onInput);
    return () => {
      form.removeEventListener("input", onInput);
      clearTimeout(timer);
    };
  }, [form, storageKey, arm]);

  // Drop the unload guard if the whole page unmounts (e.g. after submit+nav).
  useEffect(() => disarm, [disarm]);

  const clear = useCallback(() => {
    disarm();
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    setDraft(null);
  }, [disarm, storageKey]);

  const restore = useCallback(() => {
    const saved = readDraft(storageKey);
    if (form && saved) {
      for (const [name, value] of Object.entries(saved.values)) {
        const field = form.elements.namedItem(name);
        if (
          field instanceof HTMLInputElement ||
          field instanceof HTMLTextAreaElement ||
          field instanceof HTMLSelectElement
        ) {
          field.value = value;
        }
      }
      arm(); // restored content is unsaved until submitted
    }
    setDraft(null); // dismiss the banner; storage stays until submit/discard
  }, [form, storageKey, arm]);

  return { formRef: setForm, draft, restore, discard: clear, clear };
}

export function DraftRestoreBanner({
  draft,
  onRestore,
  onDiscard,
}: {
  draft: StoredDraft | null;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  if (!draft) return null;
  return (
    <div
      role="status"
      className="card flex flex-wrap items-center justify-between gap-2 border-line px-3 py-2"
    >
      <p className="text-[12px] text-ink-2">
        Unsaved draft found from {new Date(draft.savedAt).toLocaleString()}.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onRestore}
        >
          Restore
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onDiscard}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
