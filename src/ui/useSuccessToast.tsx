import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const DISMISS_MS = 3500;

/**
 * Auto-dismissing confirmation toast for create/save actions that would
 * otherwise finish silently. Call `notifySuccess(message)` after the mutation
 * resolves; render `host` once in the page. Sibling of useUndoToast, which
 * covers reversible actions.
 */
export function useSuccessToast(): {
  notifySuccess: (message: string) => void;
  host: ReactNode;
} {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const notifySuccess = useCallback(
    (next: string) => {
      clearTimer();
      setMessage(next);
      timerRef.current = window.setTimeout(() => setMessage(null), DISMISS_MS);
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  const host = message ? (
    <output
      aria-live="polite"
      className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-full bg-ink px-4.5 py-2.5 text-sm font-semibold text-panel shadow-[0_12px_28px_rgba(0,0,0,0.28)] dark:text-canvas"
    >
      {message}
    </output>
  ) : null;

  return { notifySuccess, host };
}
