import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ponytail: no toast lib in repo — reuse the inline notice style from
// action-prompt and auto-dismiss. 7s sits inside the requested 5–10s window.
const UNDO_WINDOW_MS = 7000;

type UndoState = {
  message: string;
  onUndo: () => void | Promise<void>;
} | null;

/**
 * Inline "Undo" toast for reversible soft-delete/supersede actions. Call
 * `notifyUndo(message, onUndo)` after the action succeeds; render `host` in the
 * page. The toast reverses the action when tapped, then clears.
 */
export function useUndoToast(): {
  notifyUndo: (message: string, onUndo: () => void | Promise<void>) => void;
  host: ReactNode;
} {
  const [state, setState] = useState<UndoState>(null);
  const [undoing, setUndoing] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const notifyUndo = useCallback(
    (message: string, onUndo: () => void | Promise<void>) => {
      clearTimer();
      setState({ message, onUndo });
      timerRef.current = window.setTimeout(
        () => setState(null),
        UNDO_WINDOW_MS,
      );
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  const host = state ? (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="mt-3 flex items-center justify-between gap-3 rounded-sm border border-line bg-inset px-3 py-2 text-sm text-ink-2"
      role="status"
    >
      <span>{state.message}</span>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={undoing}
        onClick={() => {
          const { onUndo } = state;
          clearTimer();
          void (async () => {
            setUndoing(true);
            try {
              await onUndo();
            } finally {
              setUndoing(false);
              setState(null);
            }
          })();
        }}
      >
        {undoing ? "Undoing…" : "Undo"}
      </button>
    </div>
  ) : null;

  return { notifyUndo, host };
}
